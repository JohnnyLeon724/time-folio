import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
const client = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'always', retry: false, refetchOnWindowFocus: true },
    mutations: { networkMode: 'always', retry: false },
  },
});
export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
