import { Stack, CfnOutput, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as apigw2 from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
// import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import {
  HttpLambdaAuthorizer,
} from "aws-cdk-lib/aws-apigatewayv2-authorizers";
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

    const { config, primaryTable: table  } = props;

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
          allowOrigins: [
            "http://localhost:3000",
          ],
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
    const adminLambdas: lambda[] = [
      {
        name: "admin-products",
        entry: "lambda/admin/products.ts",
        route: "/admin/products",
        methods: [
          apigw2.HttpMethod.DELETE,
          apigw2.HttpMethod.PATCH,
          apigw2.HttpMethod.POST,
        ],
        environment: {
          DB_TABLE_NAME: props.primaryTable.tableName,
          // BUCKET_NAME: bucket.bucketName,
          REGION: config.region,
        },
        permissions: {
          db: "RW" as const,
        },
        // authorizer: this.adminAuthorizer,
      },
    ];


    // Create all admin lambdas
    adminLambdas.forEach((lambdaDef) => {
      new ApiLambdaConstructor(this, `${lambdaDef.name}-function`, {
        ...lambdaDef,
        projectName: config.projectName,
        httpApi: this.httpApi,
        table,
        // bucket,
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

