import { CacheService } from './cache.service';
describe('derived market view cache bypass', () => {
  it('does not serve or write an outer cached view when its TTL is zero', async () => {
    const redis = { get: jest.fn().mockResolvedValue('{"price":1}'), set: jest.fn() };
    const cache = Object.assign(Object.create(CacheService.prototype), { redis }) as CacheService;
    const compute = jest.fn().mockResolvedValue({ price: 2 });
    expect(await cache.remember('portfolio:summary:yahoo:p:v1', 0, compute)).toEqual({ price: 2 });
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
