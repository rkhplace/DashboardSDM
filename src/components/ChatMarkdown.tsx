import Markdown from 'react-markdown'

export function ChatMarkdown({ text }: { text: string }) {
  return <Markdown>{text}</Markdown>
}
