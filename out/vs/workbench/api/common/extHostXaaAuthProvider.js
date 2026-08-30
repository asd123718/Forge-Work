import { stringHash } from "../../../base/common/hash.js";
import { buildIdJagExchangeBody, buildResourceRedemptionBody, fetchAuthorizationServerMetadata, getClaimsFromJWT, isAuthorizationTokenResponse } from "../../../base/common/oauth.js";
const IDP_SCOPES = ["openid", "offline_access"];
function cacheKey(resource, scopes) {
  return resource + "|" + [...scopes].sort().join(" ");
}
function isExpired(entry, now = Date.now()) {
  if (entry.token.expires_in === void 0) {
    return false;
  }
  return now > entry.created_at + entry.token.expires_in * 1e3 - 6e4;
}
function XaaifyAuthProvider(Base) {
  return class XaaAuthenticationProvider extends Base {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args) {
      super(...args);
      this._resourceTokens = /* @__PURE__ */ new Map();
      /**
       * Per-(resource, client_id) client secrets. Lazily populated via the main-thread
       * prompt. Keyed by both the resource indicator and the client_id because two
       * different resources may legitimately share a client_id but require different
       * secrets — keying by client_id alone could send the wrong secret to the wrong AS.
       */
      this._resourceClientSecrets = /* @__PURE__ */ new Map();
      const issuer = this.authorizationServer;
      this.id = `xaa:${issuer.toString(true)}`;
      this._logger.trace(`[XAA] Provider constructed for issuer ${issuer.toString(true)}. authorization_endpoint=${this._serverMetadata.authorization_endpoint}, token_endpoint=${this._serverMetadata.token_endpoint}`);
    }
    /** Compound key for {@link _resourceClientSecrets}, matching main-thread secret storage scoping. */
    _resourceClientSecretKey(resource, clientId) {
      return `${resource}|${clientId}`;
    }
    async getSessions(scopes, options) {
      const resource = options.resource;
      const audience = options.audience;
      if (!scopes && !resource && !audience) {
        return super.getSessions(scopes, options);
      }
      if (!resource || !scopes || !audience) {
        return [];
      }
      const key = cacheKey(resource, scopes);
      const entry = this._resourceTokens.get(key);
      if (entry && !isExpired(entry)) {
        return [toSession(entry.token, entry.scopes, entry.account)];
      }
      if (entry) {
        this._resourceTokens.delete(key);
      }
      const idpSession = await this._tryGetSilentIdpSession();
      if (!idpSession?.idToken) {
        return [];
      }
      try {
        const minted = await this._mintResourceToken(
          idpSession,
          [...scopes],
          audience,
          resource,
          options,
          /* silent */
          true
        );
        if (!minted) {
          return [];
        }
        return [toSession(minted.token, minted.scopes, minted.account)];
      } catch (err) {
        this._logger.warn(`[XAA] Silent token mint failed for resource=${resource}; falling back to interactive. Error: ${err.message}`);
        return [];
      }
    }
    async createSession(scopes, options) {
      const audience = options.audience;
      const resource = options.resource;
      this._logger.trace(`[XAA] createSession scopes=[${scopes.join(" ")}] audience=${audience} resource=${resource}`);
      if (!audience) {
        throw new Error("Enterprise-managed authentication requires `options.audience` (the resource's authorization server URL) but none was provided.");
      }
      if (!resource) {
        throw new Error("Enterprise-managed authentication requires `options.resource` (the resource indicator / MCP server URL) but none was provided.");
      }
      const idpSession = await this._ensureIdpSession();
      if (!idpSession.idToken) {
        throw new Error("IdP session is missing an id_token; the issuer must support OpenID Connect and the `openid` scope.");
      }
      const minted = await this._mintResourceToken(
        idpSession,
        scopes,
        audience,
        resource,
        options,
        /* silent */
        false
      );
      if (!minted) {
        throw new Error("Failed to mint a resource access token for the enterprise-managed MCP server.");
      }
      return toSession(minted.token, minted.scopes, minted.account);
    }
    /**
     * Mints a resource-scoped access token by running legs 2-4 of the XAA flow:
     *   2. Exchange IdP id_token → ID-JAG (RFC 8693 token exchange at issuer)
     *   3. Discover the resource AS token endpoint
     *   4. Redeem the ID-JAG at the resource AS for an access token (RFC 7523 jwt-bearer grant)
     *
     * When `silent` is true, this method MUST NOT prompt the user. If the resource AS uses a
     * distinct client_id (xaa.dev's "{client}-at-{resource}" pattern) and no client_secret can
     * be resolved without prompting, this returns `undefined`.
     *
     * Caches the resulting token in `_resourceTokens` so subsequent getSessions are O(1).
     */
    async _mintResourceToken(idpSession, scopes, audience, resource, options, silent) {
      const jag = await this._exchangeForIdJag(idpSession.idToken, audience, resource, scopes);
      const resourceTokenEndpoint = await this._discoverResourceTokenEndpoint(audience);
      let resourceClientId = this._clientId;
      let resourceClientIdFromJag = false;
      const configuredResourceClientId = typeof options.clientId === "string" && options.clientId.length > 0 ? options.clientId : void 0;
      if (configuredResourceClientId) {
        resourceClientId = configuredResourceClientId;
        resourceClientIdFromJag = resourceClientId !== this._clientId;
      } else {
        try {
          const jagClaims = getClaimsFromJWT(jag);
          if (typeof jagClaims.client_id === "string" && jagClaims.client_id.length > 0) {
            resourceClientId = jagClaims.client_id;
            resourceClientIdFromJag = resourceClientId !== this._clientId;
          }
        } catch (err) {
          this._logger.warn(`[XAA] Could not decode ID-JAG to read resource client_id; falling back to IdP client_id. Error: ${err.message}`);
        }
      }
      let resourceClientSecret = this._clientSecret;
      const configuredResourceClientSecret = typeof options.clientSecret === "string" && options.clientSecret.length > 0 ? options.clientSecret : void 0;
      const secretCacheKey = this._resourceClientSecretKey(resource, resourceClientId);
      if (configuredResourceClientSecret) {
        resourceClientSecret = configuredResourceClientSecret;
        this._resourceClientSecrets.set(secretCacheKey, configuredResourceClientSecret);
      } else if (resourceClientIdFromJag) {
        if (this._resourceClientSecrets.has(secretCacheKey)) {
          resourceClientSecret = this._resourceClientSecrets.get(secretCacheKey);
        } else if (silent) {
          this._logger.info(`[XAA] Silent mint requires resource client_secret for '${resourceClientId}' but none is cached or configured; deferring to interactive flow.`);
          return void 0;
        } else {
          this._logger.info(`[XAA] Resource AS requires a distinct client_id '${resourceClientId}' \u2014 prompting for matching client_secret.`);
          const promptedSecret = await this._proxy.$promptForResourceClientSecret(resourceClientId, resource);
          if (promptedSecret === void 0) {
            return void 0;
          }
          this._resourceClientSecrets.set(secretCacheKey, promptedSecret);
          resourceClientSecret = promptedSecret.length > 0 ? promptedSecret : void 0;
        }
      }
      const resourceToken = await this._redeemAtResource(resourceTokenEndpoint, jag, resource, scopes, resourceClientId, resourceClientSecret);
      const entry = {
        resource,
        scopes,
        token: resourceToken,
        // Fallback identity, used when the resource token carries no id_token of its own (the usual case).
        account: idpSession.account,
        created_at: Date.now()
      };
      this._resourceTokens.set(cacheKey(resource, scopes), entry);
      return entry;
    }
    /**
     * Returns the IdP session if one is available without any user interaction, otherwise
     * `undefined`. Critically does NOT call `super.createSession`, so this is safe to use
     * from {@link getSessions}.
     */
    async _tryGetSilentIdpSession() {
      const cleanOptions = {};
      const existing = await super.getSessions(IDP_SCOPES, cleanOptions);
      return existing.length ? existing[0] : void 0;
    }
    async _ensureIdpSession() {
      this._logger.trace(`[XAA] _ensureIdpSession: scopes=[${IDP_SCOPES.join(" ")}] authorization_endpoint=${this._serverMetadata.authorization_endpoint}`);
      const silent = await this._tryGetSilentIdpSession();
      if (silent?.idToken) {
        this._logger.trace(`[XAA] _ensureIdpSession: reusing existing IdP session`);
        return silent;
      }
      this._logger.trace(`[XAA] _ensureIdpSession: creating new IdP session via super.createSession`);
      return super.createSession([...IDP_SCOPES], {});
    }
    async _exchangeForIdJag(idToken, audience, resource, scopes) {
      const tokenEndpoint = this._serverMetadata.token_endpoint;
      if (!tokenEndpoint) {
        throw new Error("Issuer metadata is missing token_endpoint; cannot perform XAA token exchange.");
      }
      const body = buildIdJagExchangeBody(this._clientId, this._clientSecret, idToken, audience, resource, scopes);
      this._logger.trace(`[XAA] POST ${tokenEndpoint} (ID-JAG exchange) audience=${audience} resource=${resource} scope=${scopes.join(" ")}`);
      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
        },
        body: body.toString()
      });
      if (!response.ok) {
        throw new Error(`XAA token exchange (IdP) failed: ${response.status} ${await safeText(response)}`);
      }
      const data = await response.json();
      const issued = data && typeof data === "object" && typeof data.access_token === "string" ? data.access_token : void 0;
      if (!issued) {
        throw new Error(`XAA token exchange (IdP) returned no access_token. Response: ${JSON.stringify(data)}`);
      }
      return issued;
    }
    async _discoverResourceTokenEndpoint(audience) {
      const { metadata, errors } = await fetchAuthorizationServerMetadata(audience);
      if (!metadata?.token_endpoint) {
        throw new Error(`Failed to discover resource authorization server metadata for '${audience}': ${errors.map((e) => e.message).join("; ") || "no token_endpoint in metadata"}`);
      }
      return metadata.token_endpoint;
    }
    async _redeemAtResource(tokenEndpoint, idJag, resource, scopes, resourceClientId, resourceClientSecret) {
      const body = buildResourceRedemptionBody(resourceClientId, resourceClientSecret, idJag, resource, scopes);
      this._logger.trace(`[XAA] POST ${tokenEndpoint} (ID-JAG redemption) client_id=${resourceClientId} resource=${resource} scope=${scopes.join(" ")}`);
      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
        },
        body: body.toString()
      });
      if (!response.ok) {
        throw new Error(`XAA token exchange (resource) failed: ${response.status} ${await safeText(response)}`);
      }
      const data = await response.json();
      if (!isAuthorizationTokenResponse(data)) {
        throw new Error(`XAA token exchange (resource) returned an invalid token response: ${JSON.stringify(data)}`);
      }
      return data;
    }
  };
}
function toSession(token, scopes, fallbackAccount) {
  let account;
  if (token.id_token) {
    try {
      const claims = getClaimsFromJWT(token.id_token);
      account = {
        id: claims.sub || "unknown",
        label: claims.preferred_username || claims.name || claims.email || "XAA"
      };
    } catch {
    }
  }
  account ??= fallbackAccount ?? { id: "unknown", label: "XAA" };
  return {
    id: stringHash(token.access_token, 0).toString(),
    accessToken: token.access_token,
    account,
    scopes: [...scopes],
    idToken: token.id_token
  };
}
async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return response.statusText;
  }
}
export {
  IDP_SCOPES,
  XaaifyAuthProvider,
  cacheKey,
  isExpired,
  toSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0WGFhQXV0aFByb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IHN0cmluZ0hhc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IGJ1aWxkSWRKYWdFeGNoYW5nZUJvZHksIGJ1aWxkUmVzb3VyY2VSZWRlbXB0aW9uQm9keSwgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEsIGdldENsYWltc0Zyb21KV1QsIElBdXRob3JpemF0aW9uSldUQ2xhaW1zLCBJQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2UsIGlzQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYXV0aC5qcyc7XG5pbXBvcnQgeyBEeW5hbWljQXV0aFByb3ZpZGVyIH0gZnJvbSAnLi9leHRIb3N0QXV0aGVudGljYXRpb24uanMnO1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxudHlwZSBDdG9yPFQ+ID0gbmV3ICguLi5hcmdzOiBhbnlbXSkgPT4gVDtcblxuLyoqXG4gKiBTY29wZXMgdXNlZCB3aGVuIGJvb3RzdHJhcHBpbmcgdGhlIElkUCBzZXNzaW9uIGZvciBhbiBYQUEgZmxvdy5cbiAqXG4gKiBgb3BlbmlkYCBpcyByZXF1aXJlZCBiZWNhdXNlIHRoZSBJRC1KQUcgdG9rZW4gZXhjaGFuZ2UgdXNlcyB0aGUgSWRQLWlzc3VlZFxuICogYGlkX3Rva2VuYCBhcyBgc3ViamVjdF90b2tlbmAgKHBlciBkcmFmdC1pZXRmLW9hdXRoLWlkZW50aXR5LWFzc2VydGlvbi1hdXRoei1ncmFudFxuICogc2VjdGlvbiAzLjEsIHRoZSBzdWJqZWN0IHRva2VuIE1VU1QgYmUgb2YgdHlwZSBgdXJuOmlldGY6cGFyYW1zOm9hdXRoOnRva2VuLXR5cGU6aWRfdG9rZW5gKS5cbiAqIGBvZmZsaW5lX2FjY2Vzc2AgaXMgcmVxdWVzdGVkIHNvIHdlIGdldCBhIHJlZnJlc2ggdG9rZW4gZm9yIHRoZSBJZFAgc2Vzc2lvbi5cbiAqL1xuZXhwb3J0IGNvbnN0IElEUF9TQ09QRVM6IHJlYWRvbmx5IHN0cmluZ1tdID0gWydvcGVuaWQnLCAnb2ZmbGluZV9hY2Nlc3MnXTtcblxuaW50ZXJmYWNlIElSZXNvdXJjZUNhY2hlRW50cnkge1xuXHRyZWFkb25seSByZXNvdXJjZTogc3RyaW5nO1xuXHRyZWFkb25seSBzY29wZXM6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSB0b2tlbjogSUF1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlO1xuXHQvKiogRmFsbGJhY2sgaWRlbnRpdHkgKHRoZSBJZFAgbG9naW4gYWNjb3VudCkgZm9yIHNlc3Npb25zIGJ1aWx0IGZyb20gdGhpcyB0b2tlbiwgdXNlZCB3aGVuIHRoZSByZXNvdXJjZSB0b2tlbiBoYXMgbm8gaWRfdG9rZW4gb2YgaXRzIG93bi4gKi9cblx0cmVhZG9ubHkgYWNjb3VudDogdnNjb2RlLkF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnRJbmZvcm1hdGlvbjtcblx0cmVhZG9ubHkgY3JlYXRlZF9hdDogbnVtYmVyO1xufVxuXG4vKiogQ2FjaGUga2V5IGZvciByZXNvdXJjZS1zY29wZWQgdG9rZW5zLiBFeHBvcnRlZCBmb3IgdGVzdGluZy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYWNoZUtleShyZXNvdXJjZTogc3RyaW5nLCBzY29wZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0cmV0dXJuIHJlc291cmNlICsgJ3wnICsgWy4uLnNjb3Blc10uc29ydCgpLmpvaW4oJyAnKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIGNhY2hlZCB0b2tlbiBpcyBwYXN0IChvciB3aXRoaW4gNjBzIG9mKSBpdHMgZXhwaXJ5LiBQdXJlXG4gKiBhbmQgZXhwb3J0ZWQgZm9yIHRlc3RpbmcuXG4gKlxuICogTWludHMgZnJlc2ggSUQtSkFHIGFzc2VydGlvbnMgYXJlIHVzdWFsbHkgc2hvcnQtbGl2ZWQgKG1pbnV0ZXMpLiBXZSB0cmVhdCB0b2tlbnMgYXMgZXhwaXJlZFxuICogNjBzIGJlZm9yZSB0aGVpciBub21pbmFsIGV4cGlyeSB0byBhdm9pZCBjbG9jayBza2V3IGFuZCBpbi1mbGlnaHQgcmVkZW1wdGlvbnMgcmFjaW5nIHBhc3RcbiAqIGBleHBgLiBUb2tlbnMgd2l0aG91dCBgZXhwaXJlc19pbmAgZGVmaW5lZCBhcmUgdHJlYXRlZCBhcyBuZXZlci1leHBpcmluZyAoY2FjaGVkXG4gKiB1bnRpbCB0aGUgcHJvY2VzcyBleGl0cyk7IGBleHBpcmVzX2luOiAwYCBpcyB0cmVhdGVkIGFzIGltbWVkaWF0ZWx5IGV4cGlyZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0V4cGlyZWQoZW50cnk6IHsgdG9rZW46IHsgZXhwaXJlc19pbj86IG51bWJlciB9OyBjcmVhdGVkX2F0OiBudW1iZXIgfSwgbm93OiBudW1iZXIgPSBEYXRlLm5vdygpKTogYm9vbGVhbiB7XG5cdGlmIChlbnRyeS50b2tlbi5leHBpcmVzX2luID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIG5vdyA+IGVudHJ5LmNyZWF0ZWRfYXQgKyAoZW50cnkudG9rZW4uZXhwaXJlc19pbiAqIDEwMDApIC0gNjBfMDAwO1xufVxuXG4vKipcbiAqIChQcmV2aWV3KSBNaXhpbiB0aGF0IHR1cm5zIGEge0BsaW5rIER5bmFtaWNBdXRoUHJvdmlkZXJ9IHN1YmNsYXNzIGludG8gYVxuICogQ3Jvc3MgQXBwIEFjY2VzcyAoWEFBKSAvIGVudGVycHJpc2UtbWFuYWdlZCBhdXRoZW50aWNhdGlvbiBwcm92aWRlciwgcGVyXG4gKiBgZHJhZnQtaWV0Zi1vYXV0aC1pZGVudGl0eS1hc3NlcnRpb24tYXV0aHotZ3JhbnRgLlxuICpcbiAqIFRoZSBJZFAgbG9naW4gbGVnIGlzIGlkZW50aWNhbCB0byB0aGUgYmFzZSBjbGFzcyBcdTIwMTQgQXV0aCBDb2RlICsgUEtDRSBhZ2FpbnN0XG4gKiB0aGUgb3JnLWNvbmZpZ3VyZWQgaXNzdWVyLCB1c2luZyB0aGUgcHJlLXJlZ2lzdGVyZWQgY2xpZW50IGNyZWRlbnRpYWxzLiBPblxuICogdG9wIG9mIHRoYXQ6XG4gKlxuICogICAxLiBgY3JlYXRlU2Vzc2lvbmAgZW5zdXJlcyBhbiBJZFAgc2Vzc2lvbiBleGlzdHMgKGRlbGVnYXRlZCB0byB0aGUgYmFzZVxuICogICAgICBjbGFzcyB3aXRoIHtAbGluayBJRFBfU0NPUEVTfSkuXG4gKiAgIDIuIEl0IFBPU1RzIHRvIHRoZSBJZFAgdG9rZW4gZW5kcG9pbnQgd2l0aCBgZ3JhbnRfdHlwZT10b2tlbi1leGNoYW5nZWAsXG4gKiAgICAgIGBzdWJqZWN0X3Rva2VuPTxpZF90b2tlbj5gLCBgc3ViamVjdF90b2tlbl90eXBlPWlkX3Rva2VuYCxcbiAqICAgICAgYHJlcXVlc3RlZF90b2tlbl90eXBlPWlkLWphZ2AsIGBhdWRpZW5jZT08cmVzb3VyY2UgQVM+YCxcbiAqICAgICAgYHJlc291cmNlPTxyZXNvdXJjZSBpbmRpY2F0b3I+YCwgYHNjb3BlPTxyZXF1ZXN0ZWQgc2NvcGVzPmAgdG8gbWludCBhblxuICogICAgICBJRC1KQUcuXG4gKiAgIDMuIEl0IGRpc2NvdmVycyB0aGUgcmVzb3VyY2UncyBhdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YSAodGhlIGF1ZGllbmNlXG4gKiAgICAgIFVSTCkgYW5kIFBPU1RzIHRoZSBJRC1KQUcgdG8gaXRzIHRva2VuIGVuZHBvaW50IHdpdGhcbiAqICAgICAgYGdyYW50X3R5cGU9dXJuOmlldGY6cGFyYW1zOm9hdXRoOmdyYW50LXR5cGU6and0LWJlYXJlcmAsXG4gKiAgICAgIGBhc3NlcnRpb249PGlkLWphZz5gLCBgcmVzb3VyY2U9PHJlc291cmNlIGluZGljYXRvcj5gLFxuICogICAgICBgc2NvcGU9PHJlcXVlc3RlZCBzY29wZXM+YCB0byBvYnRhaW4gYSByZXNvdXJjZS1zY29wZWQgYWNjZXNzIHRva2VuLlxuICogICA0LiBUaGUgcmVzb3VyY2Utc2NvcGVkIHRva2VuIGlzIGNhY2hlZCBpbi1tZW1vcnkgcGVyIGAocmVzb3VyY2UsIHNjb3BlcylgXG4gKiAgICAgIGFuZCByZXR1cm5lZCBhcyB0aGUgc2Vzc2lvbidzIGFjY2VzcyB0b2tlbi5cbiAqXG4gKiBUaGUgcmVzb3VyY2UgaW5kaWNhdG9yIGlzIHJlYWQgZnJvbSBgb3B0aW9ucy5yZXNvdXJjZWAgKFJGQyA4NzA3KSBhbmQgdGhlXG4gKiByZXNvdXJjZSdzIGF1dGhvcml6YXRpb24gc2VydmVyIFVSTCBmcm9tIGBvcHRpb25zLmF1ZGllbmNlYCBvblxuICoge0BsaW5rIHZzY29kZS5BdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnN9LlxuICovXG5leHBvcnQgZnVuY3Rpb24gWGFhaWZ5QXV0aFByb3ZpZGVyPFRCYXNlIGV4dGVuZHMgQ3RvcjxEeW5hbWljQXV0aFByb3ZpZGVyPj4oQmFzZTogVEJhc2UpOiBUQmFzZSB7XG5cdHJldHVybiBjbGFzcyBYYWFBdXRoZW50aWNhdGlvblByb3ZpZGVyIGV4dGVuZHMgQmFzZSB7XG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2VUb2tlbnMgPSBuZXcgTWFwPHN0cmluZywgSVJlc291cmNlQ2FjaGVFbnRyeT4oKTtcblx0XHQvKipcblx0XHQgKiBQZXItKHJlc291cmNlLCBjbGllbnRfaWQpIGNsaWVudCBzZWNyZXRzLiBMYXppbHkgcG9wdWxhdGVkIHZpYSB0aGUgbWFpbi10aHJlYWRcblx0XHQgKiBwcm9tcHQuIEtleWVkIGJ5IGJvdGggdGhlIHJlc291cmNlIGluZGljYXRvciBhbmQgdGhlIGNsaWVudF9pZCBiZWNhdXNlIHR3b1xuXHRcdCAqIGRpZmZlcmVudCByZXNvdXJjZXMgbWF5IGxlZ2l0aW1hdGVseSBzaGFyZSBhIGNsaWVudF9pZCBidXQgcmVxdWlyZSBkaWZmZXJlbnRcblx0XHQgKiBzZWNyZXRzIFx1MjAxNCBrZXlpbmcgYnkgY2xpZW50X2lkIGFsb25lIGNvdWxkIHNlbmQgdGhlIHdyb25nIHNlY3JldCB0byB0aGUgd3JvbmcgQVMuXG5cdFx0ICovXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2VDbGllbnRTZWNyZXRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHRcdC8qKiBDb21wb3VuZCBrZXkgZm9yIHtAbGluayBfcmVzb3VyY2VDbGllbnRTZWNyZXRzfSwgbWF0Y2hpbmcgbWFpbi10aHJlYWQgc2VjcmV0IHN0b3JhZ2Ugc2NvcGluZy4gKi9cblx0XHRwcml2YXRlIF9yZXNvdXJjZUNsaWVudFNlY3JldEtleShyZXNvdXJjZTogc3RyaW5nLCBjbGllbnRJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRcdHJldHVybiBgJHtyZXNvdXJjZX18JHtjbGllbnRJZH1gO1xuXHRcdH1cblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0Y29uc3RydWN0b3IoLi4uYXJnczogYW55W10pIHtcblx0XHRcdHN1cGVyKC4uLmFyZ3MpO1xuXHRcdFx0Ly8gYGF1dGhvcml6YXRpb25TZXJ2ZXJgIGlzIGV4cG9zZWQgYXMgYSByZWFkb25seSBmaWVsZCBieSB0aGUgYmFzZSBjbGFzcyBcdTIwMTQgdXNlIGl0XG5cdFx0XHQvLyBkaXJlY3RseSBpbnN0ZWFkIG9mIGluZGV4aW5nIGludG8gYGFyZ3NgIHNvIHRoaXMgY2FuJ3Qgc2lsZW50bHkgYnJlYWsgaWYgdGhlXG5cdFx0XHQvLyBiYXNlIGNvbnN0cnVjdG9yIHNpZ25hdHVyZSBjaGFuZ2VzLlxuXHRcdFx0Y29uc3QgaXNzdWVyID0gdGhpcy5hdXRob3JpemF0aW9uU2VydmVyO1xuXHRcdFx0dGhpcy5pZCA9IGB4YWE6JHtpc3N1ZXIudG9TdHJpbmcodHJ1ZSl9YDtcblx0XHRcdHRoaXMuX2xvZ2dlci50cmFjZShgW1hBQV0gUHJvdmlkZXIgY29uc3RydWN0ZWQgZm9yIGlzc3VlciAke2lzc3Vlci50b1N0cmluZyh0cnVlKX0uIGF1dGhvcml6YXRpb25fZW5kcG9pbnQ9JHt0aGlzLl9zZXJ2ZXJNZXRhZGF0YS5hdXRob3JpemF0aW9uX2VuZHBvaW50fSwgdG9rZW5fZW5kcG9pbnQ9JHt0aGlzLl9zZXJ2ZXJNZXRhZGF0YS50b2tlbl9lbmRwb2ludH1gKTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBhc3luYyBnZXRTZXNzaW9ucyhzY29wZXM6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBvcHRpb25zOiB2c2NvZGUuQXV0aGVudGljYXRpb25Qcm92aWRlclNlc3Npb25PcHRpb25zKTogUHJvbWlzZTx2c2NvZGUuQXV0aGVudGljYXRpb25TZXNzaW9uW10+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gb3B0aW9ucy5yZXNvdXJjZTtcblx0XHRcdGNvbnN0IGF1ZGllbmNlID0gb3B0aW9ucy5hdWRpZW5jZTtcblx0XHRcdC8vIEFjY291bnQtZW51bWVyYXRpb24gY2FsbCAoZ2V0QWNjb3VudHMpOiBubyByZXNvdXJjZSB0byBtaW50IGFnYWluc3QsIHNvIHN1cmZhY2UgdGhlIElkUFxuXHRcdFx0Ly8gc2Vzc2lvbihzKSBmcm9tIHRoZSBiYXNlIHN0b3JlLiBSZWFkLW9ubHksIHNvIGl0IGhvbm9ycyB0aGUgbm8tcHJvbXB0IGdldFNlc3Npb25zIGNvbnRyYWN0LlxuXHRcdFx0aWYgKCFzY29wZXMgJiYgIXJlc291cmNlICYmICFhdWRpZW5jZSkge1xuXHRcdFx0XHRyZXR1cm4gc3VwZXIuZ2V0U2Vzc2lvbnMoc2NvcGVzLCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHRcdGlmICghcmVzb3VyY2UgfHwgIXNjb3BlcyB8fCAhYXVkaWVuY2UpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0Ly8gMS4gRmFzdCBwYXRoOiBpbi1tZW1vcnkgY2FjaGUgZnJvbSBhIHByaW9yIGNyZWF0ZVNlc3Npb24vZ2V0U2Vzc2lvbnMgaW4gdGhpcyB3aW5kb3cuXG5cdFx0XHRjb25zdCBrZXkgPSBjYWNoZUtleShyZXNvdXJjZSwgc2NvcGVzKTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fcmVzb3VyY2VUb2tlbnMuZ2V0KGtleSk7XG5cdFx0XHRpZiAoZW50cnkgJiYgIWlzRXhwaXJlZChlbnRyeSkpIHtcblx0XHRcdFx0cmV0dXJuIFt0b1Nlc3Npb24oZW50cnkudG9rZW4sIGVudHJ5LnNjb3BlcywgZW50cnkuYWNjb3VudCldO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdC8vIEV4cGlyZWQgXHUyMDE0IGRyb3AgYW5kIHRyeSB0byBzaWxlbnRseSByZS1taW50IGJlbG93LlxuXHRcdFx0XHR0aGlzLl9yZXNvdXJjZVRva2Vucy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gMi4gU2lsZW50IHJlLW1pbnQ6IHRoZSBiYXNlIER5bmFtaWNBdXRoUHJvdmlkZXIgcGVyc2lzdHMgdGhlIElkUCBzZXNzaW9uIGluIHNlY3JldFxuXHRcdFx0Ly8gICAgc3RvcmFnZSwgc28gb24gd2luZG93IHJlbG9hZCB3ZSBjYW4gcGljayBpdCB1cCBhbmQgcmUtcnVuIGxlZ3MgMi00IChJRC1KQUcgZXhjaGFuZ2Vcblx0XHRcdC8vICAgICsgcmVzb3VyY2UgcmVkZW1wdGlvbikgd2l0aG91dCBhbnkgdXNlciBpbnRlcmFjdGlvbi4gUGVyIHRoZSBJQXV0aGVudGljYXRpb25Qcm92aWRlclxuXHRcdFx0Ly8gICAgY29udHJhY3QsIGdldFNlc3Npb25zIE1VU1QgTk9UIHByb21wdCBcdTIwMTQgaWYgYW55dGhpbmcgaXMgbWlzc2luZyB3ZSBqdXN0IHJldHVybiBbXS5cblx0XHRcdGNvbnN0IGlkcFNlc3Npb24gPSBhd2FpdCB0aGlzLl90cnlHZXRTaWxlbnRJZHBTZXNzaW9uKCk7XG5cdFx0XHRpZiAoIWlkcFNlc3Npb24/LmlkVG9rZW4pIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbWludGVkID0gYXdhaXQgdGhpcy5fbWludFJlc291cmNlVG9rZW4oaWRwU2Vzc2lvbiwgWy4uLnNjb3Blc10sIGF1ZGllbmNlLCByZXNvdXJjZSwgb3B0aW9ucywgLyogc2lsZW50ICovIHRydWUpO1xuXHRcdFx0XHRpZiAoIW1pbnRlZCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gW3RvU2Vzc2lvbihtaW50ZWQudG9rZW4sIG1pbnRlZC5zY29wZXMsIG1pbnRlZC5hY2NvdW50KV07XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Ly8gU2lsZW50IHBhdGg6IGxvZyBhbmQgZmFsbCBiYWNrIHRvIFwibm8gc2Vzc2lvblwiIHNvIHRoZSBjYWxsZXIgZGVjaWRlcyB3aGV0aGVyXG5cdFx0XHRcdC8vIHRvIGVzY2FsYXRlIHRvIGNyZWF0ZVNlc3Npb24gKHdoaWNoIGlzIGFsbG93ZWQgdG8gaW50ZXJhY3QpLlxuXHRcdFx0XHR0aGlzLl9sb2dnZXIud2FybihgW1hBQV0gU2lsZW50IHRva2VuIG1pbnQgZmFpbGVkIGZvciByZXNvdXJjZT0ke3Jlc291cmNlfTsgZmFsbGluZyBiYWNrIHRvIGludGVyYWN0aXZlLiBFcnJvcjogJHsoZXJyIGFzIEVycm9yKS5tZXNzYWdlfWApO1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlU2Vzc2lvbihzY29wZXM6IHN0cmluZ1tdLCBvcHRpb25zOiB2c2NvZGUuQXV0aGVudGljYXRpb25Qcm92aWRlclNlc3Npb25PcHRpb25zKTogUHJvbWlzZTx2c2NvZGUuQXV0aGVudGljYXRpb25TZXNzaW9uPiB7XG5cdFx0XHRjb25zdCBhdWRpZW5jZSA9IG9wdGlvbnMuYXVkaWVuY2U7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IG9wdGlvbnMucmVzb3VyY2U7XG5cdFx0XHR0aGlzLl9sb2dnZXIudHJhY2UoYFtYQUFdIGNyZWF0ZVNlc3Npb24gc2NvcGVzPVske3Njb3Blcy5qb2luKCcgJyl9XSBhdWRpZW5jZT0ke2F1ZGllbmNlfSByZXNvdXJjZT0ke3Jlc291cmNlfWApO1xuXHRcdFx0aWYgKCFhdWRpZW5jZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0VudGVycHJpc2UtbWFuYWdlZCBhdXRoZW50aWNhdGlvbiByZXF1aXJlcyBgb3B0aW9ucy5hdWRpZW5jZWAgKHRoZSByZXNvdXJjZVxcJ3MgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgVVJMKSBidXQgbm9uZSB3YXMgcHJvdmlkZWQuJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRW50ZXJwcmlzZS1tYW5hZ2VkIGF1dGhlbnRpY2F0aW9uIHJlcXVpcmVzIGBvcHRpb25zLnJlc291cmNlYCAodGhlIHJlc291cmNlIGluZGljYXRvciAvIE1DUCBzZXJ2ZXIgVVJMKSBidXQgbm9uZSB3YXMgcHJvdmlkZWQuJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVuc3VyZSBJZFAgc2Vzc2lvbiB2aWEgdGhlIGJhc2UgY2xhc3MgKG1heSBpbnRlcmFjdCkuIERvbid0IHBhc3MgdGhlIFhBQSBvcHRpb25zIHRocm91Z2ggXHUyMDE0XG5cdFx0XHQvLyB0aGUgSWRQIGxvZ2luIGxlZyBpcyB1bnJlbGF0ZWQgdG8gdGhlIHJlc291cmNlL2F1ZGllbmNlLCBhbmQgdGhlIGJhc2UgcHJvdmlkZXIgd291bGRcblx0XHRcdC8vIG90aGVyd2lzZSBsb29rIGZvciBjYWNoZWQgdG9rZW5zIHNjb3BlZCBieSBhIGZvcmVpZ24gYXVkaWVuY2UuXG5cdFx0XHRjb25zdCBpZHBTZXNzaW9uID0gYXdhaXQgdGhpcy5fZW5zdXJlSWRwU2Vzc2lvbigpO1xuXHRcdFx0aWYgKCFpZHBTZXNzaW9uLmlkVG9rZW4pIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJZFAgc2Vzc2lvbiBpcyBtaXNzaW5nIGFuIGlkX3Rva2VuOyB0aGUgaXNzdWVyIG11c3Qgc3VwcG9ydCBPcGVuSUQgQ29ubmVjdCBhbmQgdGhlIGBvcGVuaWRgIHNjb3BlLicpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtaW50ZWQgPSBhd2FpdCB0aGlzLl9taW50UmVzb3VyY2VUb2tlbihpZHBTZXNzaW9uLCBzY29wZXMsIGF1ZGllbmNlLCByZXNvdXJjZSwgb3B0aW9ucywgLyogc2lsZW50ICovIGZhbHNlKTtcblx0XHRcdGlmICghbWludGVkKSB7XG5cdFx0XHRcdC8vIGBzaWxlbnQ9ZmFsc2VgIG9ubHkgcmV0dXJucyB1bmRlZmluZWQgaWYgdGhlIG1pbnQgbG9naWMgaXRzZWxmIGRlY2lkZWQgdG8gYmFpbC5cblx0XHRcdFx0Ly8gVG9kYXkgdGhlIG9ubHkgc3VjaCBwYXRoIGlzIG1pc3NpbmcgcmVzb3VyY2UgY2xpZW50X3NlY3JldCwgd2hpY2ggcHJvbXB0cyB0aGUgdXNlcjtcblx0XHRcdFx0Ly8gaWYgdGhlIHByb21wdCBpcyBkaXNtaXNzZWQgd2Ugc3RpbGwgdHJ5IHRoZSByZWRlbXB0aW9uIHdpdGggYHVuZGVmaW5lZGAgKHZhbGlkIGZvclxuXHRcdFx0XHQvLyBgdG9rZW5fZW5kcG9pbnRfYXV0aF9tZXRob2Q9bm9uZWApLiBTbyBpbiBwcmFjdGljZSB0aGlzIGJyYW5jaCBpcyB1bnJlYWNoYWJsZSBmb3Jcblx0XHRcdFx0Ly8gc2lsZW50PWZhbHNlIFx1MjAxNCBndWFyZCBkZWZlbnNpdmVseSBhbnl3YXkuXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIG1pbnQgYSByZXNvdXJjZSBhY2Nlc3MgdG9rZW4gZm9yIHRoZSBlbnRlcnByaXNlLW1hbmFnZWQgTUNQIHNlcnZlci4nKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0b1Nlc3Npb24obWludGVkLnRva2VuLCBtaW50ZWQuc2NvcGVzLCBtaW50ZWQuYWNjb3VudCk7XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogTWludHMgYSByZXNvdXJjZS1zY29wZWQgYWNjZXNzIHRva2VuIGJ5IHJ1bm5pbmcgbGVncyAyLTQgb2YgdGhlIFhBQSBmbG93OlxuXHRcdCAqICAgMi4gRXhjaGFuZ2UgSWRQIGlkX3Rva2VuIFx1MjE5MiBJRC1KQUcgKFJGQyA4NjkzIHRva2VuIGV4Y2hhbmdlIGF0IGlzc3Vlcilcblx0XHQgKiAgIDMuIERpc2NvdmVyIHRoZSByZXNvdXJjZSBBUyB0b2tlbiBlbmRwb2ludFxuXHRcdCAqICAgNC4gUmVkZWVtIHRoZSBJRC1KQUcgYXQgdGhlIHJlc291cmNlIEFTIGZvciBhbiBhY2Nlc3MgdG9rZW4gKFJGQyA3NTIzIGp3dC1iZWFyZXIgZ3JhbnQpXG5cdFx0ICpcblx0XHQgKiBXaGVuIGBzaWxlbnRgIGlzIHRydWUsIHRoaXMgbWV0aG9kIE1VU1QgTk9UIHByb21wdCB0aGUgdXNlci4gSWYgdGhlIHJlc291cmNlIEFTIHVzZXMgYVxuXHRcdCAqIGRpc3RpbmN0IGNsaWVudF9pZCAoeGFhLmRldidzIFwie2NsaWVudH0tYXQte3Jlc291cmNlfVwiIHBhdHRlcm4pIGFuZCBubyBjbGllbnRfc2VjcmV0IGNhblxuXHRcdCAqIGJlIHJlc29sdmVkIHdpdGhvdXQgcHJvbXB0aW5nLCB0aGlzIHJldHVybnMgYHVuZGVmaW5lZGAuXG5cdFx0ICpcblx0XHQgKiBDYWNoZXMgdGhlIHJlc3VsdGluZyB0b2tlbiBpbiBgX3Jlc291cmNlVG9rZW5zYCBzbyBzdWJzZXF1ZW50IGdldFNlc3Npb25zIGFyZSBPKDEpLlxuXHRcdCAqL1xuXHRcdHByaXZhdGUgYXN5bmMgX21pbnRSZXNvdXJjZVRva2VuKFxuXHRcdFx0aWRwU2Vzc2lvbjogdnNjb2RlLkF1dGhlbnRpY2F0aW9uU2Vzc2lvbixcblx0XHRcdHNjb3Blczogc3RyaW5nW10sXG5cdFx0XHRhdWRpZW5jZTogc3RyaW5nLFxuXHRcdFx0cmVzb3VyY2U6IHN0cmluZyxcblx0XHRcdG9wdGlvbnM6IHZzY29kZS5BdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMsXG5cdFx0XHRzaWxlbnQ6IGJvb2xlYW4sXG5cdFx0KTogUHJvbWlzZTxJUmVzb3VyY2VDYWNoZUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0XHQvLyBMZWcgMjogaWRfdG9rZW4gXHUyMTkyIElELUpBR1xuXHRcdFx0Y29uc3QgamFnID0gYXdhaXQgdGhpcy5fZXhjaGFuZ2VGb3JJZEphZyhpZHBTZXNzaW9uLmlkVG9rZW4hLCBhdWRpZW5jZSwgcmVzb3VyY2UsIHNjb3Blcyk7XG5cblx0XHRcdC8vIExlZyAzOiByZXNvdXJjZSBBUyB0b2tlbiBlbmRwb2ludFxuXHRcdFx0Y29uc3QgcmVzb3VyY2VUb2tlbkVuZHBvaW50ID0gYXdhaXQgdGhpcy5fZGlzY292ZXJSZXNvdXJjZVRva2VuRW5kcG9pbnQoYXVkaWVuY2UpO1xuXG5cdFx0XHQvLyBMZWcgNCBwcmVwOiByZXNvbHZlIHRoZSByZXNvdXJjZSBjbGllbnRfaWQuXG5cdFx0XHQvLyBQZXIgZHJhZnQtaWV0Zi1vYXV0aC1pZGVudGl0eS1hc3NlcnRpb24tYXV0aHotZ3JhbnQgc2VjdGlvbiAzLjIsIHRoZSBJRC1KQUcgY2FycmllcyBhXG5cdFx0XHQvLyBgY2xpZW50X2lkYCBjbGFpbSBpZGVudGlmeWluZyB0aGUgcmVxdWVzdGluZyBhcHAgdG8gdGhlIHJlc291cmNlIEFTLiBUaGlzIGlzIG9mdGVuXG5cdFx0XHQvLyBkaXN0aW5jdCBmcm9tIHRoZSBJZFAgYGNsaWVudF9pZGAgKHhhYS5kZXYgZm9yIGV4YW1wbGUgdXNlcyBhXG5cdFx0XHQvLyBge2lkcF9jbGllbnRfaWR9LWF0LXtyZXNvdXJjZX1gIGZvcm0pLCBzbyB3ZSBleHRyYWN0IGl0IGZyb20gdGhlIGFzc2VydGlvbiByYXRoZXIgdGhhblxuXHRcdFx0Ly8gcmV1c2luZyBgdGhpcy5fY2xpZW50SWRgLiBDYWxsZXItc3VwcGxpZWQgYG9wdGlvbnMuY2xpZW50SWRgIChmcm9tIHRoZSBNQ1Agc2VydmVyJ3Ncblx0XHRcdC8vIGBvYXV0aC5jbGllbnRJZGAgY29uZmlnKSB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgdGhlIEpBRy1leHRyYWN0ZWQgdmFsdWUuXG5cdFx0XHRsZXQgcmVzb3VyY2VDbGllbnRJZCA9IHRoaXMuX2NsaWVudElkO1xuXHRcdFx0bGV0IHJlc291cmNlQ2xpZW50SWRGcm9tSmFnID0gZmFsc2U7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkUmVzb3VyY2VDbGllbnRJZCA9IHR5cGVvZiBvcHRpb25zLmNsaWVudElkID09PSAnc3RyaW5nJyAmJiBvcHRpb25zLmNsaWVudElkLmxlbmd0aCA+IDAgPyBvcHRpb25zLmNsaWVudElkIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGNvbmZpZ3VyZWRSZXNvdXJjZUNsaWVudElkKSB7XG5cdFx0XHRcdHJlc291cmNlQ2xpZW50SWQgPSBjb25maWd1cmVkUmVzb3VyY2VDbGllbnRJZDtcblx0XHRcdFx0cmVzb3VyY2VDbGllbnRJZEZyb21KYWcgPSByZXNvdXJjZUNsaWVudElkICE9PSB0aGlzLl9jbGllbnRJZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgamFnQ2xhaW1zID0gZ2V0Q2xhaW1zRnJvbUpXVChqYWcpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgamFnQ2xhaW1zLmNsaWVudF9pZCA9PT0gJ3N0cmluZycgJiYgamFnQ2xhaW1zLmNsaWVudF9pZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZUNsaWVudElkID0gamFnQ2xhaW1zLmNsaWVudF9pZDtcblx0XHRcdFx0XHRcdHJlc291cmNlQ2xpZW50SWRGcm9tSmFnID0gcmVzb3VyY2VDbGllbnRJZCAhPT0gdGhpcy5fY2xpZW50SWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dnZXIud2FybihgW1hBQV0gQ291bGQgbm90IGRlY29kZSBJRC1KQUcgdG8gcmVhZCByZXNvdXJjZSBjbGllbnRfaWQ7IGZhbGxpbmcgYmFjayB0byBJZFAgY2xpZW50X2lkLiBFcnJvcjogJHsoZXJyIGFzIEVycm9yKS5tZXNzYWdlfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIExlZyA0IHByZXA6IHJlc29sdmUgdGhlIHJlc291cmNlIGNsaWVudF9zZWNyZXQuXG5cdFx0XHQvLyBJZiB0aGUgcmVzb3VyY2UgQVMgdXNlcyBhIGRpc3RpbmN0IGNsaWVudF9pZCwgaXQgd2lsbCByZWplY3QgYHRoaXMuX2NsaWVudFNlY3JldGBcblx0XHRcdC8vICh0aGUgSWRQIHNlY3JldCkgd2l0aCBgaW52YWxpZF9jbGllbnRgLiBUaGUgY2FsbGVyIG1heSBzdXBwbHkgdGhlIHJlc291cmNlIHNlY3JldFxuXHRcdFx0Ly8gZGlyZWN0bHkgdmlhIGBvcHRpb25zLmNsaWVudFNlY3JldGAgKHJlc29sdmVkIGluIGBtYWluVGhyZWFkTWNwYCBmcm9tIFVSTC1zY29wZWRcblx0XHRcdC8vIHNlY3JldCBzdG9yYWdlIHZpYSB0aGUgXCJTZXQgQ2xpZW50IFNlY3JldFwiIGNvZGUgbGVucyBhYm92ZSBgb2F1dGguY2xpZW50SWRgIGluXG5cdFx0XHQvLyBtY3AuanNvbik7IG90aGVyd2lzZSB3ZSBmYWxsIGJhY2sgdG8gYSBjYWNoZWQgcGVyLXJlc291cmNlIHNlY3JldCBvciBwcm9tcHQgdGhlXG5cdFx0XHQvLyB1c2VyLiBXZSBwYXNzIGB1bmRlZmluZWRgIGlmIHRoZSB1c2VyIGxlYXZlcyB0aGUgcHJvbXB0IGJsYW5rIFx1MjAxNCB0aGF0J3MgdmFsaWQgZm9yXG5cdFx0XHQvLyBjbGllbnRzIHJlZ2lzdGVyZWQgd2l0aCBgdG9rZW5fZW5kcG9pbnRfYXV0aF9tZXRob2Q9bm9uZWAuXG5cdFx0XHRsZXQgcmVzb3VyY2VDbGllbnRTZWNyZXQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHRoaXMuX2NsaWVudFNlY3JldDtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRSZXNvdXJjZUNsaWVudFNlY3JldCA9IHR5cGVvZiBvcHRpb25zLmNsaWVudFNlY3JldCA9PT0gJ3N0cmluZycgJiYgb3B0aW9ucy5jbGllbnRTZWNyZXQubGVuZ3RoID4gMCA/IG9wdGlvbnMuY2xpZW50U2VjcmV0IDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgc2VjcmV0Q2FjaGVLZXkgPSB0aGlzLl9yZXNvdXJjZUNsaWVudFNlY3JldEtleShyZXNvdXJjZSwgcmVzb3VyY2VDbGllbnRJZCk7XG5cdFx0XHRpZiAoY29uZmlndXJlZFJlc291cmNlQ2xpZW50U2VjcmV0KSB7XG5cdFx0XHRcdHJlc291cmNlQ2xpZW50U2VjcmV0ID0gY29uZmlndXJlZFJlc291cmNlQ2xpZW50U2VjcmV0O1xuXHRcdFx0XHR0aGlzLl9yZXNvdXJjZUNsaWVudFNlY3JldHMuc2V0KHNlY3JldENhY2hlS2V5LCBjb25maWd1cmVkUmVzb3VyY2VDbGllbnRTZWNyZXQpO1xuXHRcdFx0fSBlbHNlIGlmIChyZXNvdXJjZUNsaWVudElkRnJvbUphZykge1xuXHRcdFx0XHRpZiAodGhpcy5fcmVzb3VyY2VDbGllbnRTZWNyZXRzLmhhcyhzZWNyZXRDYWNoZUtleSkpIHtcblx0XHRcdFx0XHRyZXNvdXJjZUNsaWVudFNlY3JldCA9IHRoaXMuX3Jlc291cmNlQ2xpZW50U2VjcmV0cy5nZXQoc2VjcmV0Q2FjaGVLZXkpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHNpbGVudCkge1xuXHRcdFx0XHRcdC8vIFNpbGVudCBwYXRoOiB0aGUgb25seSB3YXkgdG8gb2J0YWluIHRoZSByZXNvdXJjZSBjbGllbnRfc2VjcmV0IGhlcmUgaXMgdG9cblx0XHRcdFx0XHQvLyBwcm9tcHQgdGhlIHVzZXIgXHUyMDE0IHdoaWNoIHdlIGNhbid0IGRvLiBCYWlsOyB0aGUgY2FsbGVyIHdpbGwgZXNjYWxhdGUgdG9cblx0XHRcdFx0XHQvLyBjcmVhdGVTZXNzaW9uIChhbGxvd2VkIHRvIGludGVyYWN0KSBpZiBpdCBuZWVkcyB0aGUgdG9rZW4uXG5cdFx0XHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYFtYQUFdIFNpbGVudCBtaW50IHJlcXVpcmVzIHJlc291cmNlIGNsaWVudF9zZWNyZXQgZm9yICcke3Jlc291cmNlQ2xpZW50SWR9JyBidXQgbm9uZSBpcyBjYWNoZWQgb3IgY29uZmlndXJlZDsgZGVmZXJyaW5nIHRvIGludGVyYWN0aXZlIGZsb3cuYCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgW1hBQV0gUmVzb3VyY2UgQVMgcmVxdWlyZXMgYSBkaXN0aW5jdCBjbGllbnRfaWQgJyR7cmVzb3VyY2VDbGllbnRJZH0nIFx1MjAxNCBwcm9tcHRpbmcgZm9yIG1hdGNoaW5nIGNsaWVudF9zZWNyZXQuYCk7XG5cdFx0XHRcdFx0Y29uc3QgcHJvbXB0ZWRTZWNyZXQgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvbXB0Rm9yUmVzb3VyY2VDbGllbnRTZWNyZXQocmVzb3VyY2VDbGllbnRJZCwgcmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmIChwcm9tcHRlZFNlY3JldCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHQvLyBVc2VyIGNhbmNlbGxlZCBcdTIwMTQgZG9uJ3QgY2FjaGUsIHNvIHJlLXByb21wdCBpcyBwb3NzaWJsZSBvbiBuZXh0IGNhbGwuXG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBCbGFuay1vbi1jb25maXJtIGlzIGEgdmFsaWQgYW5zd2VyIChwdWJsaWMgY2xpZW50IC8gdG9rZW5fZW5kcG9pbnRfYXV0aF9tZXRob2Q9bm9uZSkuXG5cdFx0XHRcdFx0Ly8gVGhlIG1haW4gdGhyZWFkIHJldHVybnMgJycgZm9yIHRoYXQgY2FzZSwgdW5kZWZpbmVkIGZvciBjYW5jZWwuXG5cdFx0XHRcdFx0dGhpcy5fcmVzb3VyY2VDbGllbnRTZWNyZXRzLnNldChzZWNyZXRDYWNoZUtleSwgcHJvbXB0ZWRTZWNyZXQpO1xuXHRcdFx0XHRcdHJlc291cmNlQ2xpZW50U2VjcmV0ID0gcHJvbXB0ZWRTZWNyZXQubGVuZ3RoID4gMCA/IHByb21wdGVkU2VjcmV0IDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIExlZyA0OiByZWRlbXB0aW9uLlxuXHRcdFx0Y29uc3QgcmVzb3VyY2VUb2tlbiA9IGF3YWl0IHRoaXMuX3JlZGVlbUF0UmVzb3VyY2UocmVzb3VyY2VUb2tlbkVuZHBvaW50LCBqYWcsIHJlc291cmNlLCBzY29wZXMsIHJlc291cmNlQ2xpZW50SWQsIHJlc291cmNlQ2xpZW50U2VjcmV0KTtcblxuXHRcdFx0Y29uc3QgZW50cnk6IElSZXNvdXJjZUNhY2hlRW50cnkgPSB7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRzY29wZXMsXG5cdFx0XHRcdHRva2VuOiByZXNvdXJjZVRva2VuLFxuXHRcdFx0XHQvLyBGYWxsYmFjayBpZGVudGl0eSwgdXNlZCB3aGVuIHRoZSByZXNvdXJjZSB0b2tlbiBjYXJyaWVzIG5vIGlkX3Rva2VuIG9mIGl0cyBvd24gKHRoZSB1c3VhbCBjYXNlKS5cblx0XHRcdFx0YWNjb3VudDogaWRwU2Vzc2lvbi5hY2NvdW50LFxuXHRcdFx0XHRjcmVhdGVkX2F0OiBEYXRlLm5vdygpLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3Jlc291cmNlVG9rZW5zLnNldChjYWNoZUtleShyZXNvdXJjZSwgc2NvcGVzKSwgZW50cnkpO1xuXHRcdFx0cmV0dXJuIGVudHJ5O1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCAqIFJldHVybnMgdGhlIElkUCBzZXNzaW9uIGlmIG9uZSBpcyBhdmFpbGFibGUgd2l0aG91dCBhbnkgdXNlciBpbnRlcmFjdGlvbiwgb3RoZXJ3aXNlXG5cdFx0ICogYHVuZGVmaW5lZGAuIENyaXRpY2FsbHkgZG9lcyBOT1QgY2FsbCBgc3VwZXIuY3JlYXRlU2Vzc2lvbmAsIHNvIHRoaXMgaXMgc2FmZSB0byB1c2Vcblx0XHQgKiBmcm9tIHtAbGluayBnZXRTZXNzaW9uc30uXG5cdFx0ICovXG5cdFx0cHJpdmF0ZSBhc3luYyBfdHJ5R2V0U2lsZW50SWRwU2Vzc2lvbigpOiBQcm9taXNlPHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRcdGNvbnN0IGNsZWFuT3B0aW9uczogdnNjb2RlLkF1dGhlbnRpY2F0aW9uUHJvdmlkZXJTZXNzaW9uT3B0aW9ucyA9IHt9O1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBhd2FpdCBzdXBlci5nZXRTZXNzaW9ucyhJRFBfU0NPUEVTIGFzIHN0cmluZ1tdLCBjbGVhbk9wdGlvbnMpO1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nLmxlbmd0aCA/IGV4aXN0aW5nWzBdIDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgYXN5bmMgX2Vuc3VyZUlkcFNlc3Npb24oKTogUHJvbWlzZTx2c2NvZGUuQXV0aGVudGljYXRpb25TZXNzaW9uPiB7XG5cdFx0XHR0aGlzLl9sb2dnZXIudHJhY2UoYFtYQUFdIF9lbnN1cmVJZHBTZXNzaW9uOiBzY29wZXM9WyR7SURQX1NDT1BFUy5qb2luKCcgJyl9XSBhdXRob3JpemF0aW9uX2VuZHBvaW50PSR7dGhpcy5fc2VydmVyTWV0YWRhdGEuYXV0aG9yaXphdGlvbl9lbmRwb2ludH1gKTtcblx0XHRcdGNvbnN0IHNpbGVudCA9IGF3YWl0IHRoaXMuX3RyeUdldFNpbGVudElkcFNlc3Npb24oKTtcblx0XHRcdGlmIChzaWxlbnQ/LmlkVG9rZW4pIHtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLnRyYWNlKGBbWEFBXSBfZW5zdXJlSWRwU2Vzc2lvbjogcmV1c2luZyBleGlzdGluZyBJZFAgc2Vzc2lvbmApO1xuXHRcdFx0XHRyZXR1cm4gc2lsZW50O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nZ2VyLnRyYWNlKGBbWEFBXSBfZW5zdXJlSWRwU2Vzc2lvbjogY3JlYXRpbmcgbmV3IElkUCBzZXNzaW9uIHZpYSBzdXBlci5jcmVhdGVTZXNzaW9uYCk7XG5cdFx0XHRyZXR1cm4gc3VwZXIuY3JlYXRlU2Vzc2lvbihbLi4uSURQX1NDT1BFU10sIHt9KTtcblx0XHR9XG5cblx0XHRwcml2YXRlIGFzeW5jIF9leGNoYW5nZUZvcklkSmFnKGlkVG9rZW46IHN0cmluZywgYXVkaWVuY2U6IHN0cmluZywgcmVzb3VyY2U6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0XHRjb25zdCB0b2tlbkVuZHBvaW50ID0gdGhpcy5fc2VydmVyTWV0YWRhdGEudG9rZW5fZW5kcG9pbnQ7XG5cdFx0XHRpZiAoIXRva2VuRW5kcG9pbnQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJc3N1ZXIgbWV0YWRhdGEgaXMgbWlzc2luZyB0b2tlbl9lbmRwb2ludDsgY2Fubm90IHBlcmZvcm0gWEFBIHRva2VuIGV4Y2hhbmdlLicpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYm9keSA9IGJ1aWxkSWRKYWdFeGNoYW5nZUJvZHkodGhpcy5fY2xpZW50SWQsIHRoaXMuX2NsaWVudFNlY3JldCwgaWRUb2tlbiwgYXVkaWVuY2UsIHJlc291cmNlLCBzY29wZXMpO1xuXHRcdFx0dGhpcy5fbG9nZ2VyLnRyYWNlKGBbWEFBXSBQT1NUICR7dG9rZW5FbmRwb2ludH0gKElELUpBRyBleGNoYW5nZSkgYXVkaWVuY2U9JHthdWRpZW5jZX0gcmVzb3VyY2U9JHtyZXNvdXJjZX0gc2NvcGU9JHtzY29wZXMuam9pbignICcpfWApO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh0b2tlbkVuZHBvaW50LCB7XG5cdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnLFxuXHRcdFx0XHRcdCdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJvZHk6IGJvZHkudG9TdHJpbmcoKSxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFhBQSB0b2tlbiBleGNoYW5nZSAoSWRQKSBmYWlsZWQ6ICR7cmVzcG9uc2Uuc3RhdHVzfSAke2F3YWl0IHNhZmVUZXh0KHJlc3BvbnNlKX1gKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRhdGE6IHVua25vd24gPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cdFx0XHRjb25zdCBpc3N1ZWQgPSAoZGF0YSAmJiB0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIChkYXRhIGFzIHsgYWNjZXNzX3Rva2VuPzogdW5rbm93biB9KS5hY2Nlc3NfdG9rZW4gPT09ICdzdHJpbmcnKVxuXHRcdFx0XHQ/IChkYXRhIGFzIHsgYWNjZXNzX3Rva2VuOiBzdHJpbmcgfSkuYWNjZXNzX3Rva2VuXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCFpc3N1ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBYQUEgdG9rZW4gZXhjaGFuZ2UgKElkUCkgcmV0dXJuZWQgbm8gYWNjZXNzX3Rva2VuLiBSZXNwb25zZTogJHtKU09OLnN0cmluZ2lmeShkYXRhKX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpc3N1ZWQ7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBhc3luYyBfZGlzY292ZXJSZXNvdXJjZVRva2VuRW5kcG9pbnQoYXVkaWVuY2U6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0XHRjb25zdCB7IG1ldGFkYXRhLCBlcnJvcnMgfSA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1ZGllbmNlKTtcblx0XHRcdGlmICghbWV0YWRhdGE/LnRva2VuX2VuZHBvaW50KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGRpc2NvdmVyIHJlc291cmNlIGF1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhIGZvciAnJHthdWRpZW5jZX0nOiAke2Vycm9ycy5tYXAoZSA9PiBlLm1lc3NhZ2UpLmpvaW4oJzsgJykgfHwgJ25vIHRva2VuX2VuZHBvaW50IGluIG1ldGFkYXRhJ31gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBtZXRhZGF0YS50b2tlbl9lbmRwb2ludDtcblx0XHR9XG5cblx0XHRwcml2YXRlIGFzeW5jIF9yZWRlZW1BdFJlc291cmNlKHRva2VuRW5kcG9pbnQ6IHN0cmluZywgaWRKYWc6IHN0cmluZywgcmVzb3VyY2U6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSwgcmVzb3VyY2VDbGllbnRJZDogc3RyaW5nLCByZXNvdXJjZUNsaWVudFNlY3JldDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2U+IHtcblx0XHRcdGNvbnN0IGJvZHkgPSBidWlsZFJlc291cmNlUmVkZW1wdGlvbkJvZHkocmVzb3VyY2VDbGllbnRJZCwgcmVzb3VyY2VDbGllbnRTZWNyZXQsIGlkSmFnLCByZXNvdXJjZSwgc2NvcGVzKTtcblx0XHRcdHRoaXMuX2xvZ2dlci50cmFjZShgW1hBQV0gUE9TVCAke3Rva2VuRW5kcG9pbnR9IChJRC1KQUcgcmVkZW1wdGlvbikgY2xpZW50X2lkPSR7cmVzb3VyY2VDbGllbnRJZH0gcmVzb3VyY2U9JHtyZXNvdXJjZX0gc2NvcGU9JHtzY29wZXMuam9pbignICcpfWApO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh0b2tlbkVuZHBvaW50LCB7XG5cdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnLFxuXHRcdFx0XHRcdCdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJvZHk6IGJvZHkudG9TdHJpbmcoKSxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFhBQSB0b2tlbiBleGNoYW5nZSAocmVzb3VyY2UpIGZhaWxlZDogJHtyZXNwb25zZS5zdGF0dXN9ICR7YXdhaXQgc2FmZVRleHQocmVzcG9uc2UpfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcblx0XHRcdGlmICghaXNBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZShkYXRhKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFhBQSB0b2tlbiBleGNoYW5nZSAocmVzb3VyY2UpIHJldHVybmVkIGFuIGludmFsaWQgdG9rZW4gcmVzcG9uc2U6ICR7SlNPTi5zdHJpbmdpZnkoZGF0YSl9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZGF0YTtcblx0XHR9XG5cdH07XG59XG5cbi8qKlxuICogQnVpbGRzIGEgc2Vzc2lvbiBmcm9tIGEgdG9rZW4gcmVzcG9uc2UuIElkZW50aXR5IHByZWNlZGVuY2U6IHRoZSB0b2tlbidzIG93biBgaWRfdG9rZW5gLCB0aGVuXG4gKiBgZmFsbGJhY2tBY2NvdW50YCAodGhlIElkUCBsb2dpbiBpZGVudGl0eSksIHRoZW4gYSBnZW5lcmljIGRlZmF1bHQuIE5ldmVyIHRoZSBgYWNjZXNzX3Rva2VuYCwgd2hpY2hcbiAqIGZvciBYQUEgaXMgYW4gb3BhcXVlIHJlc291cmNlIGNyZWRlbnRpYWwuIEV4cG9ydGVkIGZvciB0ZXN0aW5nLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9TZXNzaW9uKHRva2VuOiBJQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2UsIHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW10sIGZhbGxiYWNrQWNjb3VudD86IHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50SW5mb3JtYXRpb24pOiB2c2NvZGUuQXV0aGVudGljYXRpb25TZXNzaW9uIHtcblx0bGV0IGFjY291bnQ6IHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50SW5mb3JtYXRpb24gfCB1bmRlZmluZWQ7XG5cdGlmICh0b2tlbi5pZF90b2tlbikge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjbGFpbXM6IElBdXRob3JpemF0aW9uSldUQ2xhaW1zID0gZ2V0Q2xhaW1zRnJvbUpXVCh0b2tlbi5pZF90b2tlbik7XG5cdFx0XHRhY2NvdW50ID0ge1xuXHRcdFx0XHRpZDogY2xhaW1zLnN1YiB8fCAndW5rbm93bicsXG5cdFx0XHRcdGxhYmVsOiBjbGFpbXMucHJlZmVycmVkX3VzZXJuYW1lIHx8IGNsYWltcy5uYW1lIHx8IGNsYWltcy5lbWFpbCB8fCAnWEFBJyxcblx0XHRcdH07XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBpZ25vcmUgXHUyMDE0IHRoZSBpZF90b2tlbiB3YXNuJ3QgYSBkZWNvZGFibGUgSldUXG5cdFx0fVxuXHR9XG5cdGFjY291bnQgPz89IGZhbGxiYWNrQWNjb3VudCA/PyB7IGlkOiAndW5rbm93bicsIGxhYmVsOiAnWEFBJyB9O1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBzdHJpbmdIYXNoKHRva2VuLmFjY2Vzc190b2tlbiwgMCkudG9TdHJpbmcoKSxcblx0XHRhY2Nlc3NUb2tlbjogdG9rZW4uYWNjZXNzX3Rva2VuLFxuXHRcdGFjY291bnQsXG5cdFx0c2NvcGVzOiBbLi4uc2NvcGVzXSxcblx0XHRpZFRva2VuOiB0b2tlbi5pZF90b2tlbixcblx0fTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2FmZVRleHQocmVzcG9uc2U6IFJlc3BvbnNlKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gcmVzcG9uc2Uuc3RhdHVzVGV4dDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx3QkFBd0IsNkJBQTZCLGtDQUFrQyxrQkFBd0Usb0NBQW9DO0FBY3JNLE1BQU0sYUFBZ0MsQ0FBQyxVQUFVLGdCQUFnQjtBQVlqRSxTQUFTLFNBQVMsVUFBa0IsUUFBbUM7QUFDN0UsU0FBTyxXQUFXLE1BQU0sQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLEVBQUUsS0FBSyxHQUFHO0FBQ3BEO0FBV08sU0FBUyxVQUFVLE9BQStELE1BQWMsS0FBSyxJQUFJLEdBQVk7QUFDM0gsTUFBSSxNQUFNLE1BQU0sZUFBZSxRQUFXO0FBQ3pDLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxNQUFNLE1BQU0sYUFBYyxNQUFNLE1BQU0sYUFBYSxNQUFRO0FBQ25FO0FBOEJPLFNBQVMsbUJBQTRELE1BQW9CO0FBQy9GLFNBQU8sTUFBTSxrQ0FBa0MsS0FBSztBQUFBO0FBQUEsSUFnQm5ELGVBQWUsTUFBYTtBQUMzQixZQUFNLEdBQUcsSUFBSTtBQWhCZCxXQUFpQixrQkFBa0Isb0JBQUksSUFBaUM7QUFPeEU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsV0FBaUIseUJBQXlCLG9CQUFJLElBQW9CO0FBYWpFLFlBQU0sU0FBUyxLQUFLO0FBQ3BCLFdBQUssS0FBSyxPQUFPLE9BQU8sU0FB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
