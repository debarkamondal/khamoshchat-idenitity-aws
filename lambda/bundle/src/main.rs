use lambda_http::{run, service_fn, tracing, Error};
mod http_handler;
use http_handler::function_handler;

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing::init_default_subscriber();

    let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
    let client = aws_sdk_dynamodb::Client::new(&config);
    let primary_table = std::env::var("PRIMARY_TABLE").map_err(|_| Error::from("PRIMARY_TABLE not set"))?;

    run(service_fn(|event| {
        function_handler(&client, &primary_table, event)
    })).await
}
