export default function SourceLink({ title, url }) {
  return (
    <a className="source" href={url} target="_blank" rel="noreferrer">
      Source: {title}
    </a>
  )
}
