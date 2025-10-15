import { Stack, CfnOutput, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as apigw2 from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
// import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { HttpLambdaAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { SharedConfig } from "./config";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { ApiLambdaConstructor } from "./constructors/lambda-constructor";

export interface ApiStackProps extends StackProps {
  config: SharedConfig;
  primaryTable: dynamodb.TableV2;
  ttlTable: dynamodb.TableV2;
  //   bucket: s3.Bucket;
}
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

    const { config, primaryTable, ttlTable  } = props;

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

    // this.adminAuthorizer = new HttpLambdaAuthorizer(
    //   `${config.projectName}-${config.stage}-admin-authorizer`,
    //   adminAuthFn,
    //   {
    //     responseTypes: [HttpLambdaResponseType.SIMPLE],
    //   },
    // );

    //Create user authorizer
    // Define admin lambdas
    const lambdas: lambda[] = [
      {
        name: "registration-1",
        entry: "lambda/register.ts",
        route: "/register/1",
        methods: [apigw2.HttpMethod.POST],
        environment: {
          TTL_TABLE: props.ttlTable.tableName,
          REGION: config.region,
        },
        permissions: {
          db: "W" as const,
        },
      },
      {
        name: "registration-2",
        entry: "lambda/register.ts",
        route: "/register/2",
        methods: [apigw2.HttpMethod.POST],
        environment: {
          TTL_TABLE: props.ttlTable.tableName,
          PRIMARY_TABLE: props.primaryTable.tableName,
          REGION: config.region,
        },
        permissions: {
          db: "RW" as const,
        },
      },
    ];

    // Create all admin lambdas
    lambdas.forEach((lambdaDef) => {
      new ApiLambdaConstructor(this, `${lambdaDef.name}-function`, {
        ...lambdaDef,
        projectName: config.projectName,
        httpApi: this.httpApi,
        tables: [primaryTable, ttlTable],
        stage: config.stage,
      });
    });

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
