interface SectionTitleProps {
  title: string
  subtitle?: string
  accentWord?: string
  className?: string
}

export function SectionTitle({ title, subtitle, accentWord, className = "" }: SectionTitleProps) {
  // If accentWord is provided, replace it with a styled version in the title
  const formattedTitle = accentWord
    ? title.replace(
        accentWord,
        `<span class="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">${accentWord}</span>`,
      )
    : title

  return (
    <div className={`text-center mb-12 ${className}`}>
      <div className="flex items-center justify-center gap-2 mb-4">
        <div className="h-px w-4 bg-teal-500/50"></div>
        <span className="text-teal-400 text-sm tracking-widest uppercase">[ {subtitle || "CryptoGate"} ]</span>
        <div className="h-px w-4 bg-teal-500/50"></div>
      </div>
      <h2
        className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl"
        dangerouslySetInnerHTML={{ __html: formattedTitle }}
      />
    </div>
  )
}
