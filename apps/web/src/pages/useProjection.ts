import { useQuery } from '@tanstack/react-query';
import { apiGet, type Projection } from '@/lib/api';

const thisMonth = () => new Date().toISOString().slice(0, 7);

export function useProjection(start = thisMonth()) {
  return useQuery({
    queryKey: ['projection', start],
    queryFn: () => apiGet<Projection>(`/v1/projection?start=${start}`),
  });
}
