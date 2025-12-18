use aws_config::BehaviorVersion;
use aws_sdk_dynamodb::{types::AttributeValue, Client};
use base64::{engine::general_purpose, Engine as _};
use lambda_http::{Body, Error, Request, Response};
use libsignal_dezire::vxeddsa::vxeddsa_verify;
// use rand_core::{OsRng, RngCore};
use rand::{rngs::OsRng, Rng};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
struct RegisterPhoneRequest {
    phone: String,
    #[serde(rename = "iKey")]
    i_key: String,
}

#[derive(Deserialize)]
struct RegisterOtpRequest {
    phone: String,
    #[serde(rename = "preKey")]
    pre_key: String,
    #[serde(rename = "iKey")]
    i_key: String,
    sign: String,
    otp: String,
    otks: Vec<String>,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

const PUBLIC_KEY_LENGTH: usize = 32;

async fn create_user_ttl(
    client: &Client,
    phone: &str,
    identity_key: &str,
    ttl_table: &str,
) -> Result<bool, Error> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let ttl = now + 3600;

    let otp = OsRng.gen_range(100_000..999_999);

    // let otp = (OsRng.next_u32() % 900_000) + 100_000;

    let mut item = HashMap::new();
    item.insert(
        "pk".to_string(),
        AttributeValue::S("registration".to_string()),
    );
    item.insert("sk".to_string(), AttributeValue::S(phone.to_string()));
    item.insert(
        "lsi".to_string(),
        AttributeValue::S(identity_key.to_string()),
    );
    item.insert("ttl".to_string(), AttributeValue::N(ttl.to_string()));
    item.insert("otp".to_string(), AttributeValue::N(otp.to_string()));

    let result = client
        .put_item()
        .table_name(ttl_table)
        .set_item(Some(item))
        .send()
        .await?;

    Ok(result.attributes().is_none())
}

async fn verify_user(
    client: &Client,
    phone: &str,
    otp: &str,
    pre_key: &str,
    sign: &str,
    otks: Vec<String>,
    ttl_table: &str,
    primary_table: &str,
) -> Result<Response<Body>, Error> {
    // Fetch user from temp db table
    let mut key = HashMap::new();
    key.insert(
        "pk".to_string(),
        AttributeValue::S("registration".to_string()),
    );
    key.insert("sk".to_string(), AttributeValue::S(phone.to_string()));

    let user = client
        .get_item()
        .table_name(ttl_table)
        .set_key(Some(key))
        .send()
        .await?;

    let item = match user.item() {
        Some(item) => item,
        None => {
            return Ok(Response::builder()
                .status(404)
                .body(Body::Text("User not found".to_string()))?);
        }
    };

    // Verify OTP
    let stored_otp = item
        .get("otp")
        .and_then(|v| v.as_n().ok())
        .ok_or("Missing OTP")?;

    if stored_otp != otp {
        return Ok(Response::builder()
            .status(403)
            .body(Body::Text("OTP mismatch".to_string()))?);
    }

    // Get identity key
    let identity_key = item
        .get("lsi")
        .and_then(|v| v.as_s().ok())
        .ok_or("Missing identity key")?;

    // Verify signature
    let pre_key_bytes = general_purpose::STANDARD
        .decode(pre_key)
        .map_err(|_| "Invalid preKey base64")?;

    let identity_key_bytes: [u8; 32] = general_purpose::STANDARD
        .decode(identity_key.to_owned())
        .map_err(|_| "Invalid identity key base64")?
        .try_into()
        .map_err(|_| "Invalid identity key length")?;

    let sign_bytes: [u8; 96] = general_purpose::STANDARD
        .decode(sign)
        .map_err(|_| "Invalid signature base64")?
        .try_into()
        .map_err(|_| "Invalid signature length")?;
    // let sign_bytes: [u8;32]= sign_bytes.try_into().unwrap()

    // Verify Ed25519 signature
    if identity_key_bytes.len() != PUBLIC_KEY_LENGTH {
        return Ok(Response::builder()
            .status(401)
            .body(Body::Text("Invalid identity key length".to_string()))?);
    }

    let message = "test";
    let mut v_out = [0u8; 32];
    let mut message_byte = [0u8; 32];
    message_byte[..message.len()].copy_from_slice(message.as_bytes());

    if vxeddsa_verify(
        &identity_key_bytes,
        &message_byte,
        &sign_bytes,
        &mut v_out as *mut [u8; 32],
    ) {
        return Ok(Response::builder()
            .status(401)
            .body(Body::Text("Bad request".to_string()))?);
    }

    // Add user to permanent table
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let mut permanent_item = HashMap::new();
    permanent_item.insert("pk".to_string(), AttributeValue::S("user".to_string()));
    permanent_item.insert("sk".to_string(), AttributeValue::S(phone.to_string()));
    permanent_item.insert(
        "lsi".to_string(),
        AttributeValue::S(identity_key.to_string()),
    );
    permanent_item.insert("createdAt".to_string(), AttributeValue::N(now.to_string()));
    permanent_item.insert(
        "sigPreKey".to_string(),
        AttributeValue::S(pre_key.to_string()),
    );

    let otks_attr: Vec<AttributeValue> =
        otks.into_iter().map(|otk| AttributeValue::S(otk)).collect();
    permanent_item.insert("otks".to_string(), AttributeValue::L(otks_attr));

    client
        .put_item()
        .table_name(primary_table)
        .set_item(Some(permanent_item))
        .send()
        .await?;

    Ok(Response::builder().status(204).body(Body::Empty)?)
}

pub(crate) async fn function_handler(
    client: &Client,
    ttl_table: &str,
    primary_table: &str,
    event: Request,
) -> Result<Response<Body>, Error> {

    let path = event.uri().path();
    let method = event.method().as_str();

    match (method, path) {
        ("POST", "/register/phone") => {
            let body = event.body();
            let req: RegisterPhoneRequest = match serde_json::from_slice(body.as_ref()) {
                Ok(req) => req,
                Err(e) => {
                    return Ok(Response::builder()
                        .status(400)
                        .body(Body::Text(format!("Invalid JSON: {}", e)))?);
                }
            };

            match create_user_ttl(&client, &req.phone, &req.i_key, &ttl_table).await {
                Ok(success) => {
                    if success {
                        Ok(Response::builder().status(204).body(Body::Empty)?)
                    } else {
                        Ok(Response::builder().status(500).body(Body::Text("Failed to create user entry".to_string()))?)
                    }
                }
                Err(e) => {
                    Ok(Response::builder().status(500).body(Body::Text(format!("Internal Error: {}", e)))?)
                }
            }
        }
        ("POST", "/register/otp") => {
            let body = event.body();
            let req: RegisterOtpRequest = serde_json::from_slice(body.as_ref())?;

            verify_user(
                &client,
                &req.phone,
                &req.otp,
                &req.pre_key,
                &req.sign,
                req.otks,
                &ttl_table,
                &primary_table,
            )
            .await
        }
        _ => Ok(Response::builder()
            .status(404)
            .body(Body::Text("Not found".to_string()))?),
    }
}
