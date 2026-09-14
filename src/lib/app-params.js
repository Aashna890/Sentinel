

import { getAccessToken, clearAccessToken } from '@/api/authClient';

const isClearAccessTokenRequested = () =>
  new URLSearchParams(window.location.search).get('clear_access_token') === 'true';

const getAppParams = () => {
  if (isClearAccessTokenRequested()) {
    clearAccessToken();
  }
  return {
    token: getAccessToken(),
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  };
};

export const appParams = {
  ...getAppParams(),
};