import dotenv from 'dotenv';
import createApp from './app.js';
import { validateLLMProviderConfig } from './providers/llm/index.js';

dotenv.config();

try {
  validateLLMProviderConfig();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}

const PORT = process.env.PORT || 3001;
const app = createApp();

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
