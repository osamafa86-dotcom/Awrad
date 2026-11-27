import { parseMarkdown, type Inline } from '@/lib/markdown';

function Text({ content }: { content: Inline[] }) {
  return content.map((part, index) =>
    part.bold ? (
      <strong key={index} className="font-semibold">
        {part.text}
      </strong>
    ) : (
      part.text
    ),
  );
}

/** Long-form content (the privacy policy) from the tiny Markdown subset of src/lib/markdown.ts, on the tokens. */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-16">
      {parseMarkdown(source).map((block, index) => {
        switch (block.kind) {
          case 'heading':
            return block.level === 1 ? (
              <h1 key={index} className="t-display-title text-fg-primary">
                <Text content={block.content} />
              </h1>
            ) : (
              <h2 key={index} className="mt-16 t-display-section text-fg-primary">
                <Text content={block.content} />
              </h2>
            );
          case 'paragraph':
            return (
              <p key={index} className="t-body-md text-fg-primary">
                <Text content={block.content} />
              </p>
            );
          case 'list':
            return (
              <ul key={index} className="flex list-disc flex-col gap-8 ps-24 t-body-md text-fg-primary">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Text content={item} />
                  </li>
                ))}
              </ul>
            );
        }
      })}
    </div>
  );
}
