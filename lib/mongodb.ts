import dns from "dns";
import { MongoClient, Db, Collection } from "mongodb";
import { UserDocument } from "./models/user";

const options = {};

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

// Reset stale cached promise on HMR module reload
if (process.env.NODE_ENV === "development") {
  global._mongoClientPromise = undefined;
}

const DEV_FALLBACK_URI = "mongodb://127.0.0.1:27017/flixrec";

function getCleanUri(): string {
  let u = (process.env.MONGODB_URI || "").trim();
  while (u.startsWith("MONGODB_URI=")) {
    u = u.replace(/^MONGODB_URI=/, "").trim();
  }
  return u || DEV_FALLBACK_URI;
}

/**
 * Resolves mongodb+srv:// URIs using public DNS resolvers (8.8.8.8, 1.1.1.1)
 * to avoid Windows ECONNREFUSED issues on local DNS routers.
 */
async function resolveSrvUri(uri: string): Promise<string> {
  const clean = getCleanUri();
  if (!clean.startsWith("mongodb+srv://")) {
    return clean;
  }

  try {
    const parsed = new URL(clean.replace("mongodb+srv://", "http://"));
    const hostname = parsed.hostname;
    const auth = parsed.username ? `${parsed.username}:${parsed.password}@` : "";
    const pathname = parsed.pathname || "/flixrec";

    const resolver = new dns.promises.Resolver();
    resolver.setServers(["8.8.8.8", "1.1.1.1"]);

    const srvRecords = await resolver.resolveSrv(`_mongodb._tcp.${hostname}`);
    let txtParams = "authSource=admin";
    try {
      const txtRecords = await resolver.resolveTxt(hostname);
      if (txtRecords.length > 0 && txtRecords[0].length > 0) {
        txtParams = txtRecords[0].join("&");
      }
    } catch {}

    const hosts = srvRecords.map((r) => `${r.name}:${r.port}`).join(",");
    const directUri = `mongodb://${auth}${hosts}${pathname}?ssl=true&${txtParams}`;
    return directUri;
  } catch (err) {
    console.warn("DNS SRV resolution fallback returned original URI:", err);
    return clean;
  }
}

export async function getClient(): Promise<MongoClient> {
  const uriToUse = getCleanUri();

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = (async () => {
        const finalUri = await resolveSrvUri(uriToUse);
        const client = new MongoClient(finalUri, options);
        return client.connect();
      })().catch((err) => {
        global._mongoClientPromise = undefined;
        throw err;
      });
    }
    return global._mongoClientPromise;
  } else {
    const finalUri = await resolveSrvUri(uriToUse);
    const client = new MongoClient(finalUri, options);
    return client.connect();
  }
}

export default getClient;

export async function getDb(dbName = "flixrec"): Promise<Db> {
  const client = await getClient();
  return client.db(dbName);
}

export async function getUsersCollection(): Promise<Collection<UserDocument>> {
  const db = await getDb();
  return db.collection<UserDocument>("users");
}
