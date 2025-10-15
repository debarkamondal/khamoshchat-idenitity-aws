import { Stack, CfnOutput, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { SharedConfig } from "./config";

export interface InfrastructureStackProps extends StackProps {
  config: SharedConfig;
}

export class InfrastructureStack extends Stack {
  public readonly primaryTable: dynamodb.TableV2;
  public readonly ttlTable: dynamodb.TableV2;

  constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Create DynamoDB table
    this.primaryTable = new dynamodb.TableV2(
      this,
      `${config.projectName}-${config.stage}-primary-table`,
      {
        tableName: `${config.projectName}-${config.stage}-primary`,
        partitionKey: {
          name: "pk",
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: "sk",
          type: dynamodb.AttributeType.STRING,
        },
        localSecondaryIndexes: [
          {
            indexName: "lsi",
            sortKey: { name: "lsi", type: dynamodb.AttributeType.STRING },
          },
        ],
        removalPolicy:
          config.stage === "prod"
            ? RemovalPolicy.RETAIN
            : RemovalPolicy.DESTROY,
      },
    );
    this.ttlTable = new dynamodb.TableV2(
      this,
      `${config.projectName}-${config.stage}-primary-table`,
      {
        tableName: `${config.projectName}-${config.stage}-primary`,
        partitionKey: {
          name: "pk",
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: "sk",
          type: dynamodb.AttributeType.STRING,
        },
        localSecondaryIndexes: [
          {
            indexName: "lsi",
            sortKey: { name: "lsi", type: dynamodb.AttributeType.STRING },
          },
        ],
        removalPolicy:
          config.stage === "prod"
            ? RemovalPolicy.RETAIN
            : RemovalPolicy.DESTROY,
      },
    );

    // Outputs
    new CfnOutput(this, "PrimaryTableName", { value: this.primaryTable.tableName });
    new CfnOutput(this, "TtlTableName", { value: this.ttlTable.tableName });
  }
}

