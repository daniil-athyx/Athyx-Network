# Firebase Deploy Rule

Every time the user asks to push or deploy an update to Firebase, BEFORE running `firebase deploy` you MUST do the following:

1. Ask the user what they want to put in the update log (changelog). Do NOT deploy yet.
2. Wait for their response.
3. Once they provide the update notes, write those notes into `update_log.json` in the root of the project. Make sure to generate a new unique `updateId` (like an incremented version number or timestamp), set a nice `title`, and add their points to the `changes` array.
4. Only AFTER `update_log.json` has been updated with the new log, run the `firebase deploy` command.
