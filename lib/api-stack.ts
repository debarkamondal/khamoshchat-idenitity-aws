import { Stack, CfnOutput, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as apigw2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { SharedConfig } from "./config";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { RustLambdaConstructor } from "./constructors/rust-lambda-constructor";

export interface ApiStackProps extends StackProps {
  config: SharedConfig;
  primaryTable: dynamodb.TableV2;
  ttlTable: dynamodb.TableV2;
  //   bucket: s3.Bucket;
}
type rustLambda = {
  name: string;
  manifestPath: string;
  route: string;
  methods: apigw2.HttpMethod[];
  environment?:
  | {
    [key: string]: string;
  }
  | undefined;
  permissions?: {
    db?: "RW" | "R" | "W";
    // s3?: "RW" | "R" | "W";
  };
  authorizer?: HttpLambdaAuthorizer;
};
type lambda = {
  name: string;
  entry: string;
  route: string;
  methods: apigw2.HttpMethod[];
  environment?:
  | {
    [key: string]: string;
  }
  | undefined;
  permissions?: {
    db?: "RW" | "R" | "W";
    // s3?: "RW" | "R" | "W";
  };
  authorizer?: HttpLambdaAuthorizer;
};

export class ApiStack extends Stack {
  public readonly httpApi: apigw2.HttpApi;
  // public readonly adminAuthorizer: HttpLambdaAuthorizer;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config, primaryTable, ttlTable } = props;

    // Create custom domain
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      `${config.backendDomainName}-certificate`,
      config.certArn,
    );

    const customDomain = new apigw2.DomainName(this, config.backendDomainName, {
      domainName: config.backendDomainName,
      certificate,
    });

    // Create HTTP API
    this.httpApi = new apigw2.HttpApi(
      this,
      `${config.projectName}-${config.stage}-api`,
      {
        defaultDomainMapping: {
          domainName: customDomain,
          mappingKey: config.stage,
        },
        corsPreflight: {
          allowOrigins: ["http://localhost:3000"],
          allowMethods: [apigw2.CorsHttpMethod.GET],
        },
      },
    );

    // Create a rust lambda handler
    // const rustRole = new iam.Role(
    //   this,
    //   `${config.projectName}-${config.stage}-rust-lamda-role`,
    //   {
    //     roleName: PhysicalName.GENERATE_IF_NEEDED,
    //     assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    //   },
    // );
    // rustRole.addManagedPolicy(
    //   iam.ManagedPolicy.fromAwsManagedPolicyName(
    //     "service-role/AWSLambdaBasicExecutionRole",
    //   ),
    // );
    // const rustFn = new RustFunction(
    //   this,
    //   `${config.projectName}-${config.stage}-register`,
    //   {
    //     manifestPath: "lambda/register/Cargo.toml",
    //     functionName: `${config.projectName}-${config.stage}-register-lambda`,
    //     role: rustRole,
    //   },
    // );
    // const rustIntegration = new HttpLambdaIntegration(
    //   `${config.projectName}-register-integration`,
    //   rustFn,
    // );
    //
    // this.httpApi.addRoutes({
    //   path: "/register/otp",
    //   methods: [apigw2.HttpMethod.POST],
    //   integration: rustIntegration,
    // });
    // this.httpApi.addRoutes({
    //   path: "/register/phone",
    //   methods: [apigw2.HttpMethod.POST],
    //   integration: rustIntegration,
    // });

    // // Create admin authorizer
    // const adminAuthFn = new NodejsFunction(
    //   this,
    //   `${config.projectName}-${config.stage}-admin-authorizer-lambda`,
    //   {
    //     functionName: `${config.projectName}-${config.stage}-admin-authorizer-lambda`,
    //     entry: "lambda/admin/authorizer.ts",
    //     handler: "handler",
    //     runtime: lambda.Runtime.NODEJS_22_X,
    //     environment: {
    //       JWTSecret: config.JWTSecret,
    //     },
    //   },
    // );
    //
    // this.adminAuthorizer = new HttpLambdaAuthorizer(
    //   `${config.projectName}-${config.stage}-admin-authorizer`,
    //   adminAuthFn,
    //   {
    //     responseTypes: [HttpLambdaResponseType.SIMPLE],
    //   },
    // );
    //
    // Define admin lambdas
    const rustLambdas: rustLambda[] = [

      {
        name: "registration-otp",
        manifestPath: "lambda/register/Cargo.toml",
        route: "/register/otp",
        methods: [apigw2.HttpMethod.POST],
        environment: {
          PRIMARY_TABLE: props.primaryTable.tableName,
          TTL_TABLE: props.ttlTable.tableName,
          REGION: config.region,
        },
        permissions: {
          db: "RW" as const,
        },
      },
      {
        name: "registration-phone",
        manifestPath: "lambda/register/Cargo.toml",
        route: "/register/phone",
        methods: [apigw2.HttpMethod.POST],
        environment: {
          PRIMARY_TABLE: props.primaryTable.tableName,
          TTL_TABLE: props.ttlTable.tableName,
          REGION: config.region,
        },
        permissions: {
          db: "W" as const,
        },
      },
      {
        name: "bundle",
        manifestPath: "lambda/bundle/Cargo.toml",
        route: "/bundle/{phone}",
        methods: [apigw2.HttpMethod.POST],
        environment: {
          PRIMARY_TABLE: props.primaryTable.tableName,
          TTL_TABLE: props.ttlTable.tableName,
          REGION: config.region,
        },
        permissions: {
          db: "RW" as const,
        },
      },
    ]
    rustLambdas.forEach((lambdaDef) => {
      new RustLambdaConstructor(this, `${lambdaDef.name}-function`, {
        ...lambdaDef,
        projectName: config.projectName,
        httpApi: this.httpApi,
        tables: [primaryTable, ttlTable],
        stage: config.stage,
      });

    })
    // const lambdas: lambda[] = [
    //   {
    //     name: "registration-phone",
    //     entry: "lambda/register.ts",
    //     route: "/register/phone",
    //     methods: [apigw2.HttpMethod.POST],
    //     environment: {
    //       TTL_TABLE: props.ttlTable.tableName,
    //       REGION: config.region,
    //     },
    //     permissions: {
    //       db: "W" as const,
    //     },
    //   },
    //   {
    //     name: "registration-otp",
    //     entry: "lambda/register.ts",
    //     route: "/register/otp",
    //     methods: [apigw2.HttpMethod.POST],
    //     environment: {
    //       TTL_TABLE: props.ttlTable.tableName,
    //       PRIMARY_TABLE: props.primaryTable.tableName,
    //       REGION: config.region,
    //     },
    //     permissions: {
    //       db: "RW" as const,
    //     },
    //   },
    // ];
    //
    // // Create all admin lambdas
    // lambdas.forEach((lambdaDef) => {
    //   new ApiLambdaConstructor(this, `${lambdaDef.name}-function`, {
    //     ...lambdaDef,
    //     projectName: config.projectName,
    //     httpApi: this.httpApi,
    //     tables: [primaryTable, ttlTable],
    //     stage: config.stage,
    //   });
    // });

    // Outputs
    new CfnOutput(this, "ApiUrl", { value: this.httpApi.url! });
    new CfnOutput(this, "CNAME", { value: customDomain.regionalDomainName });
    new CfnOutput(this, "ApiDomainUrl", {
      value: `https://${config.backendDomainName}/${config.stage}`,
    });
    // new CfnOutput(this, "S3URL", {
    //   value: props.bucket.bucketRegionalDomainName,
    // });
  }
}
