import { createCitationChipsFeature } from './features/citation-chips.js';
import { createPageScrollFeature } from './features/page-scroll.js';
import { createSearchThreadsFeature } from './features/search-threads.js';

export function bootstrapGoogleAiSearchShortcuts(doc = document) {
  const features = [
    createPageScrollFeature({ doc }),
    createSearchThreadsFeature({ doc, observe: true }),
    createCitationChipsFeature({ doc }),
  ];

  for (const feature of features) {
    feature.init();
  }

  return {
    features,
    destroy() {
      for (const feature of features) {
        feature.destroy();
      }
    },
  };
}

if (typeof document !== 'undefined') {
  bootstrapGoogleAiSearchShortcuts(document);
}
