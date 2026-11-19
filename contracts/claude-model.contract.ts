import type { ThaleiaConfig } from '../src/config.ts';

export default {
  post: (config: ThaleiaConfig): true | string => {
    const model = process.env.THALEIA_CLAUDE_MODEL ?? 'sonnet';
    return config.claudeModel === model || 'Expected the configured model or the Sonnet role';
  },
};
