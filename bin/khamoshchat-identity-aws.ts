import * as cdk from 'aws-cdk-lib';
import { SharedConfig } from "../lib/config";
import * as dotenv from "dotenv";
import * as path from "path";
import { InfrastructureStack } from '../lib/infra-stack';
import { ApiStack } from '../lib/api-stack';


const app = new cdk.App();
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const config: SharedConfig = {
  backendDomainName: process.env.BACKEND_DOMAIN_NAME || "api.example.com",
  certArn:
    process.env.CERT_ARN ||
    "arn:aws:acm:region:account:certificate/certificate-id",
  stage: process.env.STAGE || "dev",
  projectName: process.env.PROJECT_NAME || "khamoshChatIdentity",
  region: process.env.REGION || "us-east-1",
};

// Define environment for all stacks
const env = {
  account: process.env.ACCOUNT_ID || "12312312312",
  region: config.region,
};

// Create stacks
const infraStack = new InfrastructureStack(
  app,
  `${config.projectName}-${config.stage}-infra`,
  {
    config,
    stackName: `${config.projectName}-${config.stage}-infra`,
    env,
  },
);
const apiStack = new ApiStack(
  app,
  `${config.projectName}-${config.stage}-api`,
  {
    config,
    stackName: `${config.projectName}-${config.stage}-api`,
    primaryTable: infraStack.primaryTable,
    ttlTable: infraStack.ttlTable,
    env,
  },
);

apiStack.addDependency(infraStack);

