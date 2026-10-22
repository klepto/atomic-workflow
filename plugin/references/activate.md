# Activate

Activate the atomic workflow before you call any other tool of the MCP server `atomic-workflow`:

1. Call the tool `activate` of the MCP server `atomic-workflow`. If its result does not start with
   `Atomic-workflow already attached.`, run the command it names with the Bash tool, with `run_in_background` set to
   true.
2. Print nothing of its result, unless the skill says to show the web URL.

The web URL is the second line of the result. A skill that shows it prints it word for word, only when the result
starts with `Started the atomic-workflow server.`, and only where the skill says.
