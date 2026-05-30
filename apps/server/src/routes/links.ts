import { Router } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { AuthRequest } from '../middleware/auth';

const router = Router();

interface LinkMetadata {
  url: string;
  type: 'youtube' | 'twitter' | 'instagram' | 'generic';
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  youtubeId?: string;
}

function getYoutubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function getLinkType(url: string): LinkMetadata['type'] {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'youtube';
  }
  if (url.includes('twitter.com') || url.includes('x.com')) {
    return 'twitter';
  }
  if (url.includes('instagram.com')) {
    return 'instagram';
  }
  return 'generic';
}

async function fetchYoutubeMetadata(videoId: string): Promise<Partial<LinkMetadata>> {
  try {
    // Use YouTube oEmbed API for metadata
    const response = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
      timeout: 5000,
    });
    return {
      title: response.data.title,
      siteName: response.data.author_name || 'YouTube',
      image: response.data.thumbnail_url,
    };
  } catch (error) {
    console.error('Failed to fetch YouTube metadata:', error);
    return {};
  }
}

async function fetchGenericMetadata(url: string): Promise<Partial<LinkMetadata>> {
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      '';

    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      '';

    const siteName =
      $('meta[property="og:site_name"]').attr('content') ||
      new URL(url).hostname;

    return {
      title: title.trim(),
      description: description.trim(),
      image: image.trim(),
      siteName: siteName.trim(),
    };
  } catch (error) {
    console.error('Failed to fetch generic metadata:', error);
    return {};
  }
}

// Get link preview metadata
router.post('/preview', async (req: AuthRequest, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }

    const type = getLinkType(url);
    const metadata: LinkMetadata = { url, type };

    if (type === 'youtube') {
      const videoId = getYoutubeVideoId(url);
      if (videoId) {
        metadata.youtubeId = videoId;
        const ytData = await fetchYoutubeMetadata(videoId);
        Object.assign(metadata, ytData);
      }
    } else {
      const genericData = await fetchGenericMetadata(url);
      Object.assign(metadata, genericData);
    }

    res.json(metadata);
  } catch (error) {
    console.error('Link preview error:', error);
    res.status(500).json({ error: 'Failed to fetch link preview' });
  }
});

export default router;
