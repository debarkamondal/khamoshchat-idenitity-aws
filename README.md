<<<<<<< HEAD

# KhamoshChat Identity (AWS) 🤫!!! 

Khamosh-chat is an app where staying ***Khamosh*** 🤫 (Hindi: silent) is a sin because nobody is listening.
A safe & secure world for just the two of you and nobody else.
In future we aim to build even bigger worlds maybe even different unierse where you can bring in others (group chat basically 😂). So,

***Ekdum Khamosh nahi rehneka !!!***

Built with ❤️ in **India**, for the **world**.

Data we store :
 - Unique identifier (phone number)
 - A fixed identity key (x25519 curve based public key)
 - A temporary signed prekey (signed with identity key and this will be rotated on regular basis)
 - A bunch of one time prekeys (x25519 based public keys for every unique connenction made each key is deleted once a handshake is complete)

## 1. Technical stuff

This is the code of the identity server that handels the X3DH handshakes. It helps two parties to asynchronously share a secret over unprotected channels. 

It's built with:

 - 🔥 Hono.js
 - 📦 AWS CDK 

And will be deployed serverlessly on AWS :
 -  λ Lambda (Node v22.x)
 - 🌐 API gateway V2
 - 💿 DynamoDB 

We will try to stick to [Signal Protocol](https://signal.org/docs/).

## 2. Constants

1. x25519 & x448 curve
2. sha-256 or sha-512


## 3. Some future plans

1. Post-quantum security

## 4. Get started

If you don't believe us and want to host your own identity server you are more than welcome to do so, go create your own universe.

### 4.1. Pre-requisites
1. Environment :

   - [AWS-CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting-started.html)
   - [Node.js](https://nodejs.org/en/download)

2. Others :
   - ARN of a certificate created using AWS ACM.

### 4.2. Cloning & installing dependencies

   ```bash
   git clone https://github.com/debarkamondal/khamoshchat-identity-aws khamoshchat-identity-aws
   cd khamoshchat-identity-aws

   npm install
   ```
### 4.3. Configuring the server
The configuration of the server is done using ``.env`` file.

1. Create a copy of ``.env.example`` and renamle it to ``.env``

   ```bash
   cp .env.example .env
   ```
2. Configure the variables before proceeding.

### 4.4. Build & Deploy
***Note:** You need to bootstarp the cdk to a region ***only*** if you are using cdk in that region for the first time.

```bash
cdk bootstarp
```
Build, synthesize and deploy the stack:

   ```bash
   npm run build
   cdk synth
   cdk deploy
   ```
Output Values of the deployment:

 - ***TODO: I'LL PROVIDE THE OUTPUT VALUES HERE AFTER FIRST TEST RUN.***
## 5. License

I have very less idea of legal stuff but I plan to keep it open source. 
These are my current terms:

1. You are free to modify and distribute.

**Legally:** This software comes under Apache License 2.0. Proper documentation will be added in future.
=======
# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
>>>>>>> e8f3bf5 (Initial commit)
