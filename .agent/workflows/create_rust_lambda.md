---
description: Create a new Rust Lambda function in the project
---

1. Ask the user for the pathname (subdirectory name) under `lambda/` if it wasn't provided in the initial request. Let's call this `[lambda_name]`.

2. Create the directory `lambda/[lambda_name]`.
// turbo
3. Initialize the cargo lambda project with HTTP support:
   ```bash
   cd lambda/[lambda_name] && cargo lambda new . --http
   ```

4. Replace the contents of `lambda/[lambda_name]/src/main.rs` with the standard boilerplate:
   ```rust
   use lambda_http::{run, service_fn, tracing, Error};
   mod http_handler;
   use http_handler::function_handler;
   
   #[tokio::main]
   async fn main() -> Result<(), Error> {
       tracing::init_default_subscriber();
   
       let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
       let client = aws_sdk_dynamodb::Client::new(&config);
       let ttl_table = std::env::var("TTL_TABLE").map_err(|_| Error::from("TTL_TABLE not set"))?;
       let primary_table = std::env::var("PRIMARY_TABLE").map_err(|_| Error::from("PRIMARY_TABLE not set"))?;
   
       run(service_fn(|event| {
           function_handler(&client, &ttl_table, &primary_table, event)
       })).await
   }
   ```

5. Create `lambda/[lambda_name]/src/http_handler.rs` with the initial handler logic. This file should contain the `function_handler` and any specific logic.
   ```rust
   use aws_sdk_dynamodb::Client;
   use lambda_http::{Body, Error, Request, Response};

   pub(crate) async fn function_handler(
       client: &Client,
       ttl_table: &str,
       primary_table: &str,
       event: Request,
   ) -> Result<Response<Body>, Error> {
       let path = event.uri().path();
       let method = event.method().as_str();

       match (method, path) {
           ("GET", "/") => {
               Ok(Response::builder()
                   .status(200)
                   .body(Body::Text("Hello from Rust Lambda!".to_string()))?)
           }
           _ => Ok(Response::builder()
               .status(404)
               .body(Body::Text("Not found".to_string()))?),
       }
   }
   ```

6. Add the necessary dependencies to `lambda/[lambda_name]/Cargo.toml`. You usually need:
   ```toml
   [dependencies]
   aws-config = "1.1.7"
   aws-sdk-dynamodb = "1.6.0"
   lambda_http = "0.14.0"
   tokio = { version = "1", features = ["macros"] }
   tracing = { version = "0.1", features = ["log"] }
   tracing-subscriber = { version = "0.3", default-features = false, features = ["fmt"] }
   serde = { version = "1.0", features = ["derive"] }
   serde_json = "1.0"
   ```
   (Adjust versions as appropriate based on other lambdas in the project).

7. Register the new lambda in `lib/api-stack.ts`.
   - Find the `rustLambdas` array.
   - Add a new object to the array:
     ```typescript
     {
       name: "[lambda_name]", // or a more descriptive name
       manifestPath: "lambda/[lambda_name]/Cargo.toml",
       route: "/[route_path]", // Ask user for the route or infer from name
       methods: [apigw2.HttpMethod.POST], // or GET, etc.
       environment: {
         PRIMARY_TABLE: props.primaryTable.tableName,
         TTL_TABLE: props.ttlTable.tableName,
         REGION: config.region,
       },
       permissions: {
         db: "RW", // or "R" or "W"
       },
     },
     ```

8. Run `npm run tsc --noEmit` to verify the changes in `lib/api-stack.ts`.

9. (Optional) Run `cargo check` inside `lambda/[lambda_name]` to verify Rust code.
