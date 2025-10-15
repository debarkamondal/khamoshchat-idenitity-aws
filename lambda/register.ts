import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Context, Hono } from "hono";
import { handle, LambdaEvent } from "hono/aws-lambda";
import crypto from "crypto";

type Bindings = {
  event: LambdaEvent;
};

const app = new Hono<{ Bindings: Bindings }>();

const ttlTable = process.env.TTL_TABLE;
const primaryTable = process.env.PRIMARY_TABLE;

const createUserTTL = async (phone: string, identityKey: string) => {
  const dbClient = new DynamoDB({});
  const db = DynamoDBDocument.from(dbClient);
  try {
    const result = await db.put({
      TableName: ttlTable,
      Item: {
        pk: "registration",
        sk: phone,
        lsi: identityKey,
        ttl: Math.floor(Date.now() / 1000) + 3600,
        opt: crypto.randomInt(100000, 1000000),
      },
    });
    if (result.$metadata.httpStatusCode !== 200) return false;
    else return true;
  } catch (error: any) {
    throw new Error(error);
  }
};

const verifyUser = async (
  phone: string,
  otp: string,
  {
    sigPreKey,
    otks,
    sign,
  }: { sigPreKey: string; sign: string; otks: string[] },
) => {
  const dbClient = new DynamoDB({});
  const db = DynamoDBDocument.from(dbClient);
  try {
    // Fetch user from temp db table
    const user = await db.get({
      TableName: ttlTable,
      Key: {
        pk: "registration",
        sk: phone,
      },
    });
    if (
      user.$metadata.httpStatusCode !== 200 ||
      !user.Item?.lsi ||
      user.Item?.otp !== otp
    )
      return false;

    // Verify user by matching sign
    const isUserValid = crypto.verify(
      "ed25519",
      new Uint8Array(Buffer.from(sigPreKey, "base64url")),
      {
        key: Buffer.concat([
          Buffer.from("302a300506032b6570032100", "hex"), // ASN.1 SPKI prefix for Ed25519
          Buffer.from(user.Item.lsi),
        ]),
        format: "der",
        type: "spki",
      },
      new Uint8Array(Buffer.from(sign, "base64url")),
    );
    if (!isUserValid) return false;

    // Add user to the permanent db if user is valid
    const result = await db.put({
      TableName: primaryTable,
      Item: {
        pk: "user",
        sk: phone,
        lsi: user.Item.lsi,
        ceratedAt: Date.now(),
        sigPreKey,
        otks,
      },
    });
    if (result.$metadata.httpStatusCode !== 200) return false;
    return true;
  } catch (error: any) {
    throw new Error(error);
  }
};
app.post("/register/1", async (c: Context) => {
  const body = await c.req.json();
  console.log(body.phone, body.identityKey)
  const user = await createUserTTL(body.phone, body.identityKey);
  if (user) return c.body(null, 204);
  else return c.body(null, 500);
});

app.post("/register/2", async (c: Context) => {
  const body: {
    phone: string;
    sigPreKey: string;
    sign: string;
    otp: string;
    otks: string[];
  } = await c.req.json();

  const isUserValid = await verifyUser(body.phone, body.otp, {
    sigPreKey: body.sigPreKey,
    sign: body.sign,
    otks: body.otks,
  });
  if (isUserValid) return c.body(null, 204);
  else return c.body(null, 401);
});

export const handler = handle(app);
