import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

describe('PostsController', () => {
  it('delegates user repost lookups to the posts service', async () => {
    const postsService = {
      getUserRepost: jest.fn().mockResolvedValue({ items: [] }),
    } as unknown as PostsService;

    const controller = new PostsController(postsService);

    const result = await controller.getUserRepost(
      { id: 'viewer-1' } as any,
      'target-1',
      undefined,
      undefined,
    );

    expect(postsService.getUserRepost).toHaveBeenCalledWith(
      'viewer-1',
      'target-1',
      undefined,
      20,
    );
    expect(result).toEqual({ items: [] });
  });
});
