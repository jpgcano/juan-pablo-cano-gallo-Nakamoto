import { useEffect, useState } from 'react';
import { getAccessToken, subscribeAccessToken } from './tokenStore';

export function useAccessToken(): string | null {
  const [token, setToken] = useState(getAccessToken());

  useEffect(() => subscribeAccessToken(setToken), []);

  return token;
}
