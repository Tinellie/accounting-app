import { NextResponse, type NextRequest } from 'next/server';
import { getAuthStore, SESSION_COOKIE } from './src/lib/auth-store';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === '/api/health') return NextResponse.next();
  const session = getAuthStore().session(request.cookies.get(SESSION_COOKIE)?.value);
  if (pathname === '/login' || pathname === '/register') {
    if (session && request.method === 'GET') return NextResponse.redirect(new URL('/', request.url));
    return NextResponse.next();
  }
  if (!session) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  }
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
