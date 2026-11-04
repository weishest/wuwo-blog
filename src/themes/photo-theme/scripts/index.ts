// Entry point, loaded once by BaseLayout. Ported from the Ghost theme's assets/js/.
import menu from './menu';
import slider from './slider';
import reveal from './reveal';
import loadMore from './loadMore';
import search from './search';
import { initLightbox } from '../../../lib/lightbox';

menu();
slider();
reveal();
loadMore();
search();
// Click to enlarge: the post header photo and images in the post body.
initLightbox('.article .split-media img, .post-content img');
