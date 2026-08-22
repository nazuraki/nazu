# Verifying the `nz_id` SSO cookie in a sibling app

usr sets `nz_id` on the shared parent domain (`USR_SSO_COOKIE_DOMAIN`) after
login. An app under that domain authenticates the browser by verifying the
cookie offline — no usr round trip except a cached JWKS fetch.

## Token

Compact ES256 JWS, header `{ alg: "ES256", kid }`, claims:

```json
{
  "iss": "usr",
  "sub": "person@example.com",
  "sid": "0123456789abcdef",
  "iat": 1700000000,
  "exp": 1700001800,
  "grants": {
    "nazu": { "roles": ["editor"], "permissions": ["write"] },
    "backplane": { "roles": ["admin"], "permissions": ["deploy"] }
  }
}
```

## Algorithm

1. Read cookie `nz_id`. Missing → step 4.
2. Fetch `https://usr.<parent domain>/.well-known/jwks.json` (cache; refetch
   on unknown `kid`). Verify signature (ES256, P-256), `iss == "usr"`, `exp`.
   Invalid/expired → step 4.
3. Authorize from `grants[<your app>]` (absent key = no access). For
   sensitive actions you may still call usr's
   `GET /api/permissions?email=<sub>&app=<app>` for a strongly consistent answer.
4. Redirect (302) to
   `https://usr.<parent domain>/api/auth/sso/refresh?return=<current absolute URL>`.
   usr re-mints the cookie from the live session (or shows login) and returns
   the browser to `return`. Only URLs under the cookie domain are honoured.

## Node (no dependencies)

```ts
import { createPublicKey, createVerify } from 'node:crypto';

const USR = process.env.USR_URL!; // e.g. https://usr.example.internal
const APP = 'nazu';
let jwks: { kid: string; key: ReturnType<typeof createPublicKey> }[] = [];
let jwksAt = 0;

async function keys(force = false) {
  if (force || Date.now() - jwksAt > 300_000) {
    const res = await fetch(`${USR}/.well-known/jwks.json`);
    const body = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
    jwks = body.keys.map((k) => ({ kid: k.kid, key: createPublicKey({ key: k, format: 'jwk' }) }));
    jwksAt = Date.now();
  }
  return jwks;
}

export async function verifyIdentity(token: string | undefined) {
  if (!token) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  if (header.alg !== 'ES256') return null;
  let key = (await keys()).find((k) => k.kid === header.kid)
    ?? (await keys(true)).find((k) => k.kid === header.kid);
  if (!key) return null;
  const v = createVerify('SHA256');
  v.update(`${h}.${p}`);
  if (!v.verify({ key: key.key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))) return null;
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (claims.iss !== 'usr' || claims.exp * 1000 <= Date.now()) return null;
  return { email: claims.sub as string, ...(claims.grants?.[APP] ?? { roles: [], permissions: [] }) };
}

// Middleware sketch (any framework):
//   const id = await verifyIdentity(cookies.nz_id);
//   if (!id) return redirect(`${USR}/api/auth/sso/refresh?return=${encodeURIComponent(request.url)}`);
```

## Go (standard library)

```go
package sso

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"strings"
	"time"
)

type Grants struct {
	Roles       []string `json:"roles"`
	Permissions []string `json:"permissions"`
}
type Claims struct {
	Iss    string            `json:"iss"`
	Sub    string            `json:"sub"`
	Sid    string            `json:"sid"`
	Exp    int64             `json:"exp"`
	Grants map[string]Grants `json:"grants"`
}

type jwk struct{ Kid, X, Y string }

func fetchKeys(usrURL string) (map[string]*ecdsa.PublicKey, error) {
	res, err := http.Get(usrURL + "/.well-known/jwks.json")
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var body struct{ Keys []jwk }
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return nil, err
	}
	out := map[string]*ecdsa.PublicKey{}
	for _, k := range body.Keys {
		x, _ := base64.RawURLEncoding.DecodeString(k.X)
		y, _ := base64.RawURLEncoding.DecodeString(k.Y)
		out[k.Kid] = &ecdsa.PublicKey{Curve: elliptic.P256(), X: new(big.Int).SetBytes(x), Y: new(big.Int).SetBytes(y)}
	}
	return out, nil
}

// Verify checks signature, iss and exp; cache keys from fetchKeys (~5 min).
func Verify(token string, keys map[string]*ecdsa.PublicKey) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("malformed")
	}
	hb, _ := base64.RawURLEncoding.DecodeString(parts[0])
	var hdr struct{ Alg, Kid string }
	if json.Unmarshal(hb, &hdr) != nil || hdr.Alg != "ES256" {
		return nil, errors.New("bad header")
	}
	pub, ok := keys[hdr.Kid]
	if !ok {
		return nil, errors.New("unknown kid")
	}
	sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
	if len(sig) != 64 {
		return nil, errors.New("bad signature")
	}
	sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if !ecdsa.Verify(pub, sum[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
		return nil, errors.New("signature")
	}
	pb, _ := base64.RawURLEncoding.DecodeString(parts[1])
	var c Claims
	if json.Unmarshal(pb, &c) != nil || c.Iss != "usr" || time.Now().Unix() >= c.Exp {
		return nil, errors.New("invalid claims")
	}
	return &c, nil
}
```

## Caveats

- Every subdomain of the cookie domain receives `nz_id`; keep the TTL short.
- Role changes propagate at TTL latency.
- `SameSite=Lax`: the cookie rides top-level navigations and same-site XHR;
  it is not sent on cross-site requests, which is fine under one parent domain.
