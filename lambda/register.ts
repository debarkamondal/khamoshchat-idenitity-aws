import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Context, Hono } from "hono";
import { handle, LambdaEvent } from "hono/aws-lambda";
import crypto from "crypto";
import { ContentfulStatusCode } from "hono/utils/http-status";

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
        otp: crypto.randomInt(100000, 1000000),
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
  { preKey, otks, sign }: { preKey: string; sign: string; otks: string[] },
): Promise<{
  status: ContentfulStatusCode;
  error?: string;
}> => {
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
    if (user.Item?.otp !== otp) return { status: 403, error: "OTP mismatch" };
    if (user.$metadata.httpStatusCode !== 200 || !user.Item?.lsi)
      return { status: 500, error: "Server error" };
    console.log("*******************");
    // Verify user by matching sign
    const isUserValid = crypto.verify(
      null,
      new Uint8Array(Buffer.from(preKey, "base64")),
      {
        key: Buffer.concat([
          Buffer.from("302a300506032b6570032100", "hex"), // ASN.1 SPKI prefix for Ed25519
          Buffer.from(user.Item.lsi, "base64"),
        ]),
        format: "der",
        type: "spki",
      },
      new Uint8Array(Buffer.from(sign, "base64")),
    );
    if (!isUserValid) return { status: 401, error: "Bad request" };

    // Add user to the permanent db if user is valid
    const result = await db.put({
      TableName: primaryTable,
      Item: {
        pk: "user",
        sk: phone,
        lsi: user.Item.lsi,
        ceratedAt: Date.now(),
        sigPreKey: preKey,
        otks,
      },
    });
    if (result.$metadata.httpStatusCode !== 200)
      return { status: 500, error: "server error" };
    return { status: 200 };
  } catch (error: any) {
    throw new Error(error);
  }
};
app.post("/register/phone", async (c: Context) => {
  const body = await c.req.json();
  const user = await createUserTTL(body.phone, body.iKey);
  if (user) return c.body(null, 204);
  else return c.body(null, 500);
});

app.post("/register/otp", async (c: Context) => {
  const body: {
    phone: string;
    preKey: string;
    iKey: string;
    sign: string;
    otp: string;
    otks: string[];
  } = await c.req.json();

  const isUserValid = await verifyUser(body.phone, body.otp, {
    preKey: body.preKey,
    sign: body.sign,
    otks: body.otks,
  });
  if (isUserValid.status === 200) return c.body(null, 204);
  else return c.text(isUserValid.error as string, isUserValid.status);
});

export const handler = handle(app);
