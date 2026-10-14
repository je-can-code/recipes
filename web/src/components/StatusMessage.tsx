/**
 * The message to show, and whether it reports a failure.
 */
interface StatusMessageProps
{
  text: string;
  isError: boolean;
}

/**
 * A quiet line standing in for content that hasn't arrived, or a red one when it couldn't.
 * @param {StatusMessageProps} props The message, and whether it is an error.
 * @returns {React.JSX.Element} The message.
 */
const StatusMessage = ({ text, isError }: StatusMessageProps): React.JSX.Element =>
{
  return (
    <p className={isError ? 'status status-error' : 'status'} role={isError ? 'alert' : 'status'}>
      {text}
    </p>
  );
};

export { StatusMessage };
