import express from 'express';
import multer from 'multer';
import createPdfIngestionService from '../ingestion/service.js';

const upload = multer({ storage: multer.memoryStorage() });

export default function createUploadRouter(options = {}) {
  const router = express.Router();
  const ingestionService = options.ingestionService || createPdfIngestionService({
    pool: options.pool,
    storageDir: options.storageDir,
    extractText: options.extractText,
    chunker: options.chunker,
    embeddingsProviderFactory: options.embeddingsProviderFactory,
    extractOptions: options.extractOptions
  });

  router.post('/pdf', upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Missing PDF file' });
      return;
    }

    try {
      const result = await ingestionService.ingest(req.file.buffer, req.file.originalname);
      res.json({ document_id: result.documentId, pages: result.pageCount, chunks: result.chunkCount });
    } catch (error) {
      console.error('Failed to ingest PDF', error);
      res.status(500).json({ error: 'Failed to ingest PDF' });
    }
  });

  return router;
}
