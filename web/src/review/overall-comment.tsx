import { Textarea } from '@/components/ui/textarea.tsx';

/**
 * Props of `OverallComment`.
 */
interface OverallCommentProps {
  /**
   * Text of the overall comment.
   */
  readonly value: string;

  /**
   * Receives the text `value` of the overall comment on each change.
   */
  readonly onChange: (value: string) => void;
}

/**
 * Overall comment of the review, which no line anchors, in a field below the diff.
 */
export const OverallComment = ({ value, onChange }: OverallCommentProps) => (
  <section className="flex flex-col gap-2">
    <h2 className="font-medium text-sm">
      <label htmlFor="review-overall">Overall comment</label>
    </h2>
    <Textarea
      id="review-overall"
      placeholder="Write what applies to the whole change"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-24 bg-background"
    />
  </section>
);
