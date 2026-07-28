import { DocPage, docMetadata } from '../../../components/DocPage'
import { PinoutDiagram, PowerBudget, WiringTable } from '../../../components/HardwareVisuals'
import { Section } from '../../../components/ui'

export const metadata = docMetadata('build', '/build')

export default function Page() {
  return (
    <>
      <DocPage slug="build" />

      {/* The reference a builder needs open on a second screen while wiring,
          rather than buried on another page. Generated from the same registry
          as the bill of materials, so it cannot drift from what they bought. */}
      <Section
        className="border-t border-[var(--line)] bg-[var(--surface-0)]"
        eyebrow="Bench reference"
        title="Keep this open while you wire"
        lede="Physical pin numbers, because that is what you count on the board. Pin 12 carries the pulse-per-second signal: it is the one connection that must be exactly right, and the one whose absence looks like nothing being wrong."
      >
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,460px)_1fr] lg:items-start">
          <PinoutDiagram tier="t2" />
          <div>
            <h3 className="eyebrow mb-3">Per sensor</h3>
            <WiringTable tier="t2" />
            <p className="mt-3 max-w-[70ch] text-[12.5px] leading-relaxed text-[var(--ink-3)]">
              Shared 3V3 and GND pins are normal. The magnetometer wants to sit at least two metres
              from this board and from any of the active-emission hardware, on a non-ferrous mast
              section, so run it on a longer lead than the rest.
            </p>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Before you go off-grid"
        title="What this node actually draws"
        lede="Summed from the tier 2 parts list rather than estimated. If you are running from solar, size against this figure and not against a round number."
      >
        <div className="mt-8">
          <PowerBudget tier="t2" />
        </div>
      </Section>
    </>
  )
}
