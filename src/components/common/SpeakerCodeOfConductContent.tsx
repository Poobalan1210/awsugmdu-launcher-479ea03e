import {
  speakerCodeOfConductIntro,
  speakerCodeOfConductAbout,
  speakerCodeOfConductSections,
  speakerCodeOfConductConclusion,
} from '@/data/speakerCodeOfConduct';

/**
 * Renders the full Speaker Code of Conduct body.
 * Shared between the public page and the invitation acceptance flow so the
 * displayed text is always identical to what a speaker agrees to.
 */
export function SpeakerCodeOfConductContent({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-6 ${className}`}>
      {speakerCodeOfConductIntro.map((para, i) => (
        <p key={`intro-${i}`} className="text-sm leading-relaxed text-muted-foreground">
          {para}
        </p>
      ))}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{speakerCodeOfConductAbout.heading}</h2>
        {speakerCodeOfConductAbout.paragraphs.map((para, i) => (
          <p key={`about-${i}`} className="text-sm leading-relaxed text-muted-foreground">
            {para}
          </p>
        ))}
      </div>

      {speakerCodeOfConductSections.map((section, si) => (
        <div key={`section-${si}`} className="space-y-3">
          <h2 className="text-lg font-semibold">{section.heading}</h2>
          {section.intro && (
            <p className="text-sm leading-relaxed text-muted-foreground">{section.intro}</p>
          )}
          {section.items?.map((item, ii) => (
            <div key={`item-${si}-${ii}`} className="space-y-1">
              {item.label && <h3 className="text-sm font-medium">{item.label}</h3>}
              <ul className="list-disc space-y-1 pl-5">
                {item.points.map((point, pi) => (
                  <li key={`point-${si}-${ii}-${pi}`} className="text-sm leading-relaxed text-muted-foreground">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Conclusion</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{speakerCodeOfConductConclusion}</p>
      </div>
    </div>
  );
}
