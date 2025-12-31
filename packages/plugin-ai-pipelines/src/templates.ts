/**
 * Pre-built Pipeline Templates
 *
 * Ready-to-use pipeline configurations for common content generation workflows.
 */

import type { Pipeline } from './pipeline.js'

export interface TemplateOptions {
  collection: string
  provider?: string
  draftMode?: boolean
}

/**
 * Pre-built pipeline templates
 */
export const PipelineTemplates = {
  /**
   * Blog post generation pipeline
   */
  blogPost: (options: TemplateOptions): Pipeline => ({
    name: 'Blog Post Generator',
    slug: 'blog-post-generator',
    description: 'Generates complete blog posts from a topic',
    collection: options.collection,
    trigger: { type: 'manual' },
    draftMode: options.draftMode ?? true,
    steps: [
      {
        name: 'outline',
        description: 'Generate blog post outline',
        prompt: `Create a detailed outline for a blog post about: {{topic}}

Include:
- A compelling title
- 3-5 main sections with subpoints
- Key takeaways

Format as structured outline.`,
        provider: options.provider,
        outputField: '_outline',
      },
      {
        name: 'title',
        description: 'Extract the title',
        prompt: `Based on this outline, provide ONLY the blog post title (no formatting):

{{_outline}}`,
        provider: options.provider,
        outputField: 'title',
      },
      {
        name: 'content',
        description: 'Generate full content',
        prompt: `Write a complete blog post based on this outline:

{{_outline}}

Requirements:
- Engaging introduction with hook
- Well-developed sections with examples
- Strong conclusion with call to action
- Approximately 1000-1500 words
- Professional but accessible tone

Output the full blog post content in markdown.`,
        provider: options.provider,
        maxTokens: 4000,
        outputField: 'content',
      },
      {
        name: 'excerpt',
        description: 'Generate excerpt',
        prompt: `Write a compelling 2-3 sentence excerpt/summary for this blog post:

Title: {{title}}

{{content}}

Output ONLY the excerpt text.`,
        provider: options.provider,
        maxTokens: 200,
        outputField: 'excerpt',
      },
      {
        name: 'seo',
        description: 'Generate SEO metadata',
        prompt: `Generate SEO metadata for this blog post:

Title: {{title}}
Excerpt: {{excerpt}}

Provide in this exact JSON format:
{
  "metaTitle": "SEO optimized title (max 60 chars)",
  "metaDescription": "SEO description (max 155 chars)",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`,
        provider: options.provider,
        outputField: 'seoMeta',
        transform: (output) => {
          try {
            return JSON.parse(output)
          } catch {
            return output
          }
        },
      },
    ],
  }),

  /**
   * Product description pipeline
   */
  productDescription: (options: TemplateOptions): Pipeline => ({
    name: 'Product Description Generator',
    slug: 'product-description-generator',
    description: 'Generates product descriptions from specifications',
    collection: options.collection,
    trigger: { type: 'manual' },
    draftMode: options.draftMode ?? true,
    steps: [
      {
        name: 'shortDescription',
        description: 'Generate short description',
        prompt: `Write a compelling 2-3 sentence product description for:

Product: {{productName}}
Specs: {{specifications}}
Category: {{category}}

Focus on key benefits and unique selling points.`,
        provider: options.provider,
        outputField: 'shortDescription',
      },
      {
        name: 'longDescription',
        description: 'Generate detailed description',
        prompt: `Write a detailed product description for:

Product: {{productName}}
Short description: {{shortDescription}}
Specifications: {{specifications}}
Category: {{category}}

Include:
- Key features and benefits
- Use cases
- Technical details
- Why customers should choose this product

Format with markdown headings.`,
        provider: options.provider,
        maxTokens: 1500,
        outputField: 'longDescription',
      },
      {
        name: 'bulletPoints',
        description: 'Generate feature bullets',
        prompt: `Create 5-7 concise bullet points highlighting the key features of:

Product: {{productName}}
Description: {{shortDescription}}

Format as a simple bulleted list.`,
        provider: options.provider,
        outputField: 'features',
      },
    ],
  }),

  /**
   * Email campaign pipeline
   */
  emailCampaign: (options: TemplateOptions): Pipeline => ({
    name: 'Email Campaign Generator',
    slug: 'email-campaign-generator',
    description: 'Generates email marketing content',
    collection: options.collection,
    trigger: { type: 'manual' },
    draftMode: options.draftMode ?? true,
    steps: [
      {
        name: 'subject',
        description: 'Generate email subject lines',
        prompt: `Create 3 compelling email subject lines for this campaign:

Purpose: {{purpose}}
Target audience: {{audience}}
Tone: {{tone}}

Format as numbered list.`,
        provider: options.provider,
        outputField: 'subjectOptions',
      },
      {
        name: 'preheader',
        description: 'Generate preheader text',
        prompt: `Write a compelling preheader text (40-100 chars) to complement this email:

Purpose: {{purpose}}
Audience: {{audience}}

Output ONLY the preheader text.`,
        provider: options.provider,
        maxTokens: 50,
        outputField: 'preheader',
      },
      {
        name: 'body',
        description: 'Generate email body',
        prompt: `Write the email body for this marketing campaign:

Purpose: {{purpose}}
Audience: {{audience}}
Tone: {{tone}}
Call to action: {{cta}}

Requirements:
- Attention-grabbing opening
- Clear value proposition
- Single focused message
- Compelling CTA
- Appropriate length for email

Format with light HTML for email.`,
        provider: options.provider,
        maxTokens: 1000,
        outputField: 'body',
      },
    ],
  }),

  /**
   * Social media content pipeline
   */
  socialMedia: (options: TemplateOptions & {
    platforms?: ('twitter' | 'linkedin' | 'facebook' | 'instagram')[]
  }): Pipeline => ({
    name: 'Social Media Content Generator',
    slug: 'social-media-generator',
    description: 'Generates social media posts for multiple platforms',
    collection: options.collection,
    trigger: { type: 'manual' },
    draftMode: options.draftMode ?? true,
    steps: [
      ...(options.platforms?.includes('twitter') ?? true
        ? [
            {
              name: 'twitter',
              description: 'Generate Twitter/X post',
              prompt: `Write a Twitter/X post about:

Topic: {{topic}}
Key message: {{message}}
Tone: {{tone}}

Requirements:
- Max 280 characters
- Include 2-3 relevant hashtags
- Engaging and shareable

Output ONLY the tweet text.`,
              provider: options.provider,
              maxTokens: 100,
              outputField: 'twitter',
            },
          ]
        : []),
      ...(options.platforms?.includes('linkedin') ?? true
        ? [
            {
              name: 'linkedin',
              description: 'Generate LinkedIn post',
              prompt: `Write a LinkedIn post about:

Topic: {{topic}}
Key message: {{message}}
Tone: Professional, thought leadership

Requirements:
- 150-300 words
- Opening hook
- Value-driven content
- Call to engagement
- 3-5 relevant hashtags at the end

Output the LinkedIn post.`,
              provider: options.provider,
              maxTokens: 500,
              outputField: 'linkedin',
            },
          ]
        : []),
      ...(options.platforms?.includes('facebook') ?? false
        ? [
            {
              name: 'facebook',
              description: 'Generate Facebook post',
              prompt: `Write a Facebook post about:

Topic: {{topic}}
Key message: {{message}}
Tone: {{tone}}

Requirements:
- Conversational tone
- 100-200 words
- Include question to drive engagement
- Optional emoji use

Output the Facebook post.`,
              provider: options.provider,
              maxTokens: 300,
              outputField: 'facebook',
            },
          ]
        : []),
      ...(options.platforms?.includes('instagram') ?? false
        ? [
            {
              name: 'instagram',
              description: 'Generate Instagram caption',
              prompt: `Write an Instagram caption about:

Topic: {{topic}}
Key message: {{message}}
Tone: {{tone}}

Requirements:
- Engaging opening line
- Story-driven content
- Call to action
- 5-10 relevant hashtags at the end
- Optional emojis

Output the Instagram caption.`,
              provider: options.provider,
              maxTokens: 400,
              outputField: 'instagram',
            },
          ]
        : []),
    ],
  }),

  /**
   * Landing page copy pipeline
   */
  landingPage: (options: TemplateOptions): Pipeline => ({
    name: 'Landing Page Copy Generator',
    slug: 'landing-page-generator',
    description: 'Generates landing page copy for products/services',
    collection: options.collection,
    trigger: { type: 'manual' },
    draftMode: options.draftMode ?? true,
    steps: [
      {
        name: 'headline',
        description: 'Generate headline and subheadline',
        prompt: `Create a compelling headline and subheadline for a landing page:

Product/Service: {{product}}
Target Audience: {{audience}}
Key Benefit: {{benefit}}

Format as:
HEADLINE: [headline]
SUBHEADLINE: [subheadline]`,
        provider: options.provider,
        outputField: 'headlines',
      },
      {
        name: 'heroSection',
        description: 'Generate hero section copy',
        prompt: `Write the hero section copy for this landing page:

Product: {{product}}
Headlines: {{headlines}}
Key Benefits: {{benefit}}

Include:
- Brief value proposition (2-3 sentences)
- Primary CTA button text

Output as markdown.`,
        provider: options.provider,
        outputField: 'hero',
      },
      {
        name: 'features',
        description: 'Generate features section',
        prompt: `Write 4-6 feature blocks for this landing page:

Product: {{product}}
Target Audience: {{audience}}

Each feature should have:
- Feature title (3-5 words)
- Feature description (1-2 sentences)
- Benefit to customer

Format as markdown with ## headings.`,
        provider: options.provider,
        maxTokens: 1000,
        outputField: 'features',
      },
      {
        name: 'socialProof',
        description: 'Generate social proof section',
        prompt: `Write a social proof section for this landing page:

Product: {{product}}
Include suggestions for:
- Testimonial prompts
- Stats to highlight
- Trust indicators

Format as markdown.`,
        provider: options.provider,
        outputField: 'socialProof',
      },
      {
        name: 'cta',
        description: 'Generate CTA section',
        prompt: `Write a compelling CTA section for this landing page:

Product: {{product}}
Primary Action: {{cta}}
Audience: {{audience}}

Include:
- CTA headline
- Brief urgency/benefit statement
- Button text
- Optional secondary action

Format as markdown.`,
        provider: options.provider,
        outputField: 'ctaSection',
      },
    ],
  }),

  /**
   * FAQ generation pipeline
   */
  faq: (options: TemplateOptions): Pipeline => ({
    name: 'FAQ Generator',
    slug: 'faq-generator',
    description: 'Generates FAQ content from product/service info',
    collection: options.collection,
    trigger: { type: 'manual' },
    draftMode: options.draftMode ?? true,
    steps: [
      {
        name: 'questions',
        description: 'Generate FAQ questions',
        prompt: `Generate 8-12 frequently asked questions about:

Topic: {{topic}}
Context: {{context}}
Target Audience: {{audience}}

Categories to cover:
- General/Overview
- Features/Functionality
- Pricing/Plans
- Support/Help
- Technical/Integration

Output as numbered list of questions only.`,
        provider: options.provider,
        outputField: 'questions',
      },
      {
        name: 'answers',
        description: 'Generate FAQ answers',
        prompt: `Provide clear, helpful answers to these FAQ questions:

Topic: {{topic}}
Questions: {{questions}}

Requirements:
- Concise but complete answers
- Professional but friendly tone
- Include relevant details
- 2-4 sentences per answer

Format as:
Q: [question]
A: [answer]`,
        provider: options.provider,
        maxTokens: 2000,
        outputField: 'faqContent',
      },
    ],
  }),
}
