import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

export async function GET() {
  let totalBytes = 0;
  let count = 0;
  let cursor: string | undefined;

  do {
    const result = await list({ prefix: "images/", cursor, limit: 1000 });
    for (const blob of result.blobs) {
      totalBytes += blob.size;
      count += 1;
    }
    cursor = result.cursor;
  } while (cursor);

  return NextResponse.json({ totalBytes, count });
}
