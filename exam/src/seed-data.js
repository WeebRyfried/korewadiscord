const sampleQuestions = [
  {
    type: 'MULTIPLE_CHOICE',
    text: 'What is the main purpose of a community wiki?',
    options: [
      ['To collect shared knowledge that members can improve over time', true],
      ['To replace all server rules', false],
      ['To store private passwords', false],
      ['To delete old discussions automatically', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'Which action is best before editing a high-traffic wiki page?',
    options: [
      ['Check the existing page context and avoid removing useful information', true],
      ['Replace the whole page with a short opinion', false],
      ['Move the page without telling anyone', false],
      ['Add unrelated images to make it longer', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'What should a Discord username or ID be used for in this exam app?',
    options: [
      ['Identifying one person so attempts can be tracked fairly', true],
      ['Posting answers publicly by default', false],
      ['Giving administrator access', false],
      ['Changing MediaWiki configuration', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'If a test is marked CLOSED, what should regular users be able to do?',
    options: [
      ['See the test in the list but not start it', true],
      ['Start the test as many times as they want', false],
      ['Edit the questions', false],
      ['Reset everyone else attempts', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'Why should secrets be stored in an environment file instead of source code?',
    options: [
      ['So credentials are not committed to GitHub', true],
      ['So the app can never read them', false],
      ['So Docker cannot use them', false],
      ['So users can see them in the browser', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'What does the per-question timer do when time expires?',
    options: [
      ['It moves the user to the next question automatically', true],
      ['It gives admin access', false],
      ['It closes every test permanently', false],
      ['It deletes the wiki page', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'Which answer type is best for a short explanation in the user own words?',
    options: [
      ['Short essay', true],
      ['Multiple choice', false],
      ['Server role', false],
      ['Database password', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'What should an admin do when they want a user to retake one test?',
    options: [
      ['Reset that user attempt for the specific test', true],
      ['Delete every test', false],
      ['Change the domain DNS record', false],
      ['Ask the user to edit LocalSettings.php', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'What is a good use of a test description?',
    options: [
      ['Summarizing the topic before the user starts', true],
      ['Storing production tokens', false],
      ['Replacing all questions', false],
      ['Changing the reverse proxy', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'What should happen after the final question is answered?',
    options: [
      ['The user submits the attempt', true],
      ['The same test restarts automatically', false],
      ['All tests become closed', false],
      ['The wiki database is restored', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'Which field controls whether users can start a test?',
    options: [
      ['The test status', true],
      ['The question position only', false],
      ['The selected option ID', false],
      ['The wiki logo path', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'Why keep CLOSED draft tests visible to admins?',
    options: [
      ['Admins can edit and open them when ready', true],
      ['Users need to submit them immediately', false],
      ['They should bypass authentication', false],
      ['They are MediaWiki pages', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'Which table stores possible choices for a multiple-choice question?',
    options: [
      ['question_options', true],
      ['tests', false],
      ['exam_users', false],
      ['wiki_images', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'What status is used after an admin clears an old attempt?',
    options: [
      ['RESET', true],
      ['OPENED', false],
      ['CLOSED', false],
      ['MULTIPLE_CHOICE', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'Which service routes /wiki and /exam in this project?',
    options: [
      ['Nginx', true],
      ['The browser cache', false],
      ['Discord itself', false],
      ['A question option', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'What should users do before they can see available tests?',
    options: [
      ['Enter their Discord ID or username', true],
      ['Log in as admin', false],
      ['Create a Docker volume', false],
      ['Change Cloudflare nameservers', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'What is the purpose of the attempts table?',
    options: [
      ['Tracking each user start and submission for a test', true],
      ['Holding MediaWiki uploaded files', false],
      ['Serving CSS assets', false],
      ['Configuring DNS records', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'What should a wiki community guideline encourage?',
    options: [
      ['Clear edits, useful sources, and respectful collaboration', true],
      ['Edit wars', false],
      ['Posting secrets', false],
      ['Deleting admin accounts', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'Which backup item matters for MediaWiki uploads?',
    options: [
      ['The wiki images volume', true],
      ['The browser URL bar', false],
      ['The selected radio button', false],
      ['The Nginx access log only', false]
    ]
  },
  {
    type: 'MULTIPLE_CHOICE',
    text: 'Why is HTTPS handled through Cloudflare in this setup?',
    options: [
      ['Visitors use a secure public URL while the VPS runs the Docker reverse proxy', true],
      ['It removes the need for a database', false],
      ['It creates exam questions automatically', false],
      ['It lets users skip timers', false]
    ]
  },
  {
    type: 'SHORT_ESSAY',
    text: 'In two or three sentences, describe what makes a helpful community wiki page.'
  },
  {
    type: 'SHORT_ESSAY',
    text: 'Explain how you would report a problem with a test question to an admin.'
  },
  {
    type: 'SHORT_ESSAY',
    text: 'Describe one rule you would add to keep a Discord community wiki organized.'
  },
  {
    type: 'SHORT_ESSAY',
    text: 'Why should each Discord ID only get one attempt per opened test?'
  },
  {
    type: 'SHORT_ESSAY',
    text: 'What kind of topics should the KorewaDiscord wiki include first?'
  }
];

module.exports = { sampleQuestions };
