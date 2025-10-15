import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpLambdaAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { PhysicalName } from "aws-cdk-lib";
// import { join } from "path";

export interface LambdaFunctionProps {
  name: string;
  entry: string;
  route: string;
  stage: string;
  methods: apigw2.HttpMethod[];
  environment?: {
    [key: string]: string;
  };
  permissions?: {
    db?: "RW" | "R" | "W";
    s3?: "RW" | "R" | "W";
  };
  authorizer?: HttpLambdaAuthorizer;
  projectName: string;
  httpApi: apigw2.HttpApi;
  tables?: TableV2[];
  // bucket?: Bucket;
}

export class ApiLambdaConstructor extends Construct {
  public readonly lambdaFunction: NodejsFunction;
  public readonly integration: HttpLambdaIntegration;

  constructor(scope: Construct, id: string, props: LambdaFunctionProps) {
    super(scope, id);

    // Set up permissions on the role before creating the Lambda
    const serviceRole = new iam.Role(
      this,
      `${props.projectName}-${props.stage}-lambda-role`,
      {
        roleName: PhysicalName.GENERATE_IF_NEEDED,
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole",
          ),
        ],
      },
    );
    if (props.tables) {
      if (props.permissions?.db === "RW") {
        props.tables.forEach((table)=> table.grantReadWriteData(serviceRole))
      } else if (props.permissions?.db === "R") {
        props.tables.forEach((table)=> table.grantReadData(serviceRole))
      } else if (props.permissions?.db === "W") {
        props.tables.forEach((table)=> table.grantWriteData(serviceRole))
      }
    }

    // if (props.bucket) {
    //   if (props.permissions?.s3 === "RW") {
    //     props.bucket.grantReadWrite(serviceRole);
    //   } else if (props.permissions?.s3 === "R") {
    //     props.bucket.grantRead(serviceRole);
    //   } else if (props.permissions?.s3 === "W") {
    //     props.bucket.grantWrite(serviceRole);
    //   }
    // }

    this.lambdaFunction = new NodejsFunction(
      this,
      `${props.projectName}-${props.name}-lambda`,
      {
        functionName: `${props.projectName}-${props.name}`,
        entry: props.entry,
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        environment: props.environment,
        role: serviceRole,
      },
    );

    this.integration = new HttpLambdaIntegration(
      `${props.projectName}-${props.name}-integration`,
      this.lambdaFunction,
    );

    props.httpApi.addRoutes({
      path: props.route,
      methods: props.methods,
      integration: this.integration,
      authorizer: props.authorizer,
    });
  }
}

