import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.redirect(`${process.env.FASTAPI_BASE_URL ?? 'http://127.0.0.1:8000'}/google/auth`)
}
