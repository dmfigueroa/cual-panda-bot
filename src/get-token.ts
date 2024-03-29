import { eq } from "drizzle-orm";
import db, { access } from "./database";
import { signedInEmitter } from "./server";

const hostname = process.env.HOSTNAME_URL;

export const getToken = async () => {
  let tokens = db.select().from(access).all();

  const access_credentials = tokens[0];

  if (
    !access_credentials ||
    !access_credentials.access_token ||
    !access_credentials.refresh_token
  ) {
    console.log(`Open ${hostname}/auth/twitch to sign in`);
    return new Promise<string>((resolve) => {
      signedInEmitter.once("signed-in", async () => {
        tokens = db.select().from(access).all();

        resolve(tokens[0].access_token as string);
      });
    });
  }

  if (
    !access_credentials.expires_in ||
    access_credentials.expires_in < Date.now()
  ) {
    await refreshTokens(access_credentials.refresh_token);
  }
  return access_credentials.access_token as string;
};

const refreshTokens = async (refreshToken: string): Promise<string> => {
  const clientId = process.env.TWITCH_BOT_CLIENT_ID;
  const clientSecret = process.env.TWITCH_BOT_CLIENT_SECRET;

  const params = new URLSearchParams();
  params.append("client_id", clientId ?? "");
  params.append("client_secret", clientSecret ?? "");
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refreshToken);

  const response = await fetch(
    `https://id.twitch.tv/oauth2/token?${params.toString()}`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    throw new Error("No se pudo obtener el token OAuth2");
  }

  const data = await response.json();

  await updateCredentials({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expires_in: data.expires_in,
  });

  return data.access_token;
};

export const authenticatedFetch = async (
  url: string,
  token: string,
  options: RequestInit & { params: URLSearchParams }
): Promise<Response> => {
  const headers = new Headers();
  headers.append("Authorization", `Bearer ${token}`);
  headers.append("Client-ID", process.env.TWITCH_BOT_CLIENT_ID ?? "");

  options.headers = headers;

  if (options.params) {
    url += `?${options.params.toString()}`;
  }

  return fetch(url, options);
};

export async function updateCredentials({
  accessToken,
  refreshToken,
  expires_in: expiresIn,
}: {
  accessToken: string;
  refreshToken: string;
  expires_in: number;
}): Promise<void> {
  // Fisrt acces element from db
  const access_credentials = db.select().from(access).all()[0];

  if (!access_credentials) {
    db.insert(access)
      .values({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: Date.now() + expiresIn * 1000,
      })
      .run();
  } else {
    db.update(access)
      .set({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: Date.now() + expiresIn * 1000,
      })
      .where(eq(access.id, access_credentials.id))
      .run();
  }

  signedInEmitter.emit("signed-in");
}
