use aws_sdk_dynamodb::types::{AttributeValue, KeysAndAttributes};
use aws_sdk_dynamodb::Client;
use base64::{engine::general_purpose, Engine as _};
use lambda_http::{Body, Error, Request, RequestExt, Response};
use libsignal_dezire::vxeddsa::vxeddsa_verify;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize)]
struct BundleRequest {
    phone: String,
    signature: String,
    vrf: String,
}

#[derive(Serialize)]
struct Opk {
    id: usize,
    key: String,
}

#[derive(Serialize)]
struct PreKeyBundle {
    #[serde(rename = "identityKey")]
    identity_key: String,
    #[serde(rename = "signedPreKey")]
    signed_prekey: String,
    #[serde(rename = "signature")]
    signature: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    opk: Option<Opk>,
}

pub(crate) async fn function_handler(
    client: &Client,
    primary_table: &str,
    event: Request,
) -> Result<Response<Body>, Error> {
    let path = event.uri().path();
    let method = event.method().as_str();
    let params = event.path_parameters();
    match (method, path) {
        ("POST", p) if p.starts_with("/bundle/") => {
            let requested_phone = match params.first("phone") {
                Some(p) if !p.is_empty() => p,
                _ => {
                    return Ok(Response::builder()
                        .status(400)
                        .body(Body::Text("Missing requested phone number".to_string()))?)
                }
            };

            let body = event.body();
            let req_body: BundleRequest = match serde_json::from_slice(body.as_ref()) {
                Ok(r) => r,
                Err(e) => {
                    return Ok(Response::builder()
                        .status(400)
                        .body(Body::Text(format!("Invalid JSON: {}", e)))?)
                }
            };

            // Batch Get Item
            let mut keys = Vec::new();

            // Requester Key
            let mut requester_key = HashMap::new();
            requester_key.insert("pk".to_string(), AttributeValue::S("user".to_string()));
            requester_key.insert("sk".to_string(), AttributeValue::S(req_body.phone.clone()));
            keys.push(requester_key);

            // Requested User Key
            let mut requested_key = HashMap::new();
            requested_key.insert("pk".to_string(), AttributeValue::S("user".to_string()));
            requested_key.insert(
                "sk".to_string(),
                AttributeValue::S(requested_phone.to_string()),
            );
            keys.push(requested_key);

            let mut request_items = HashMap::new();
            request_items.insert(
                primary_table.to_string(),
                KeysAndAttributes::builder()
                    .set_keys(Some(keys))
                    .build()
                    .unwrap(),
            );

            let batch_result = client
                .batch_get_item()
                .set_request_items(Some(request_items))
                .send()
                .await?;

            let responses = batch_result.responses.unwrap_or_default();
            let items = responses.get(primary_table).cloned().unwrap_or_default();

            // Find items
            let requester_item = items
                .iter()
                .find(|item| item.get("sk").and_then(|v| v.as_s().ok()) == Some(&req_body.phone));
            let requested_item = items.iter().find(|item| {
                item.get("sk").and_then(|v| v.as_s().ok()) == Some(&requested_phone.to_string())
            });

            // Verify Requester
            let requester_item = match requester_item {
                Some(item) => item,
                None => {
                    return Ok(Response::builder()
                        .status(404)
                        .body(Body::Text("Requester not found".to_string()))?)
                }
            };

            let signed_prekey = requester_item
                .get("signedPreKey")
                .and_then(|v| v.as_s().ok())
                .ok_or("Missing signed pre key")?;

            // Signature Verification

            let signed_prekey_bytes: [u8; 32] = general_purpose::STANDARD
                .decode(signed_prekey)
                .map_err(|_| "Invalid signed pre key base64")?
                .try_into()
                .map_err(|_| "Invalid signed pre key length")?;

            let signature_bytes: [u8; 96] = general_purpose::STANDARD
                .decode(&req_body.signature)
                .map_err(|_| "Invalid signature base64")?
                .try_into()
                .map_err(|_| "Invalid signature length")?;

            let vrf_bytes: [u8; 32] = general_purpose::STANDARD
                .decode(&req_body.vrf)
                .map_err(|_| "Invalid vrf base64")?
                .try_into()
                .map_err(|_| "Invalid vrf length")?;

            match vxeddsa_verify(
                &signed_prekey_bytes,
                requested_phone.as_bytes(),
                &signature_bytes,
            ) {
                Some(output) => {
                    if output != vrf_bytes {
                        return Ok(Response::builder()
                            .status(401)
                            .body(Body::Text("VRF mismatch".to_string()))?);
                    }
                }
                None => {
                    return Ok(Response::builder()
                        .status(401)
                        .body(Body::Text("Invalid signature".to_string()))?);
                }
            }

            // Return Requested Bundle
            if let Some(item) = requested_item {
                let identity_key = item
                    .get("lsi")
                    .and_then(|v| v.as_s().ok())
                    .cloned()
                    .unwrap_or_default();

                let signed_prekey = item
                    .get("signedPreKey")
                    .and_then(|v| v.as_s().ok())
                    .cloned()
                    .unwrap_or_default();

                let signature = item
                    .get("signature")
                    .and_then(|v| v.as_s().ok())
                    .cloned()
                    .unwrap_or_default();

                // Get last OPK with its index
                let opk_list = item.get("opks").and_then(|v| v.as_l().ok());
                let opk = match opk_list {
                    Some(list) if !list.is_empty() => {
                        let last_index = list.len() - 1;
                        let last_opk = list.last().and_then(|v| v.as_s().ok()).cloned();
                        last_opk.map(|key| Opk {
                            id: last_index,
                            key,
                        })
                    }
                    _ => None,
                };

                // Delete the last OPK from DB if it exists
                if let Some(ref opk_obj) = opk {
                    let mut key = HashMap::new();
                    key.insert("pk".to_string(), AttributeValue::S("user".to_string()));
                    key.insert(
                        "sk".to_string(),
                        AttributeValue::S(requested_phone.to_string()),
                    );

                    // let _ = client
                    //     .update_item()
                    //     .table_name(primary_table)
                    //     .set_key(Some(key))
                    //     .update_expression(format!("REMOVE opks[{}]", opk_obj.id))
                    //     .send()
                    //     .await;
                }

                let bundle = PreKeyBundle {
                    identity_key,
                    signed_prekey,
                    signature,
                    opk,
                };

                let body = serde_json::to_string(&bundle)?;
                Ok(Response::builder()
                    .status(200)
                    .header("content-type", "application/json")
                    .body(Body::Text(body))?)
            } else {
                Ok(Response::builder()
                    .status(404)
                    .body(Body::Text("Requested user not found".to_string()))?)
            }
        }
        _ => Ok(Response::builder()
            .status(404)
            .body(Body::Text("Not found".to_string()))?),
    }
}
