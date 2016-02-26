
function onGapiLoaded() {

    window.init();
}

var LSInterface = {
    updateDraft: function(draftId, content, successcb, errorcb) {
        window.localStorage.setItem(draftId, content);
        successcb();
    }
};

function generateUUID() {
    var d = new Date().getTime();
    if(window.performance && typeof window.performance.now === "function") {
        d += performance.now(); //use high-precision timer if available
    }
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random()*16)%16 | 0;
        d = Math.floor(d/16);
        return (c=='x' ? r : (r&0x3|0x8)).toString(16);
    });
    return uuid;
}

var CLIENT_ID = '468212145523-8qedsjk185kkrobrstgtroqqs6oufjbl.apps.googleusercontent.com';
var SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

var GmailInterface = {
    authorize: function(immediate, callback) {
        // invoke gmail authorization function
        gapi.auth.authorize({
            'client_id': CLIENT_ID,
            'scope': SCOPES.join(' '),
            'immediate': immediate
        }, function(authResult) {
            console.log(authResult);
            if (authResult && !authResult.error) {
                // load gmail client interface, then trigger callback
                gapi.client.load('gmail', 'v1', function() {
                    callback(true);
                });
            } else {
                // authorization failed
                callback(false);
            }
        });
    },

    // Base64 decode.
    decode: function(str) {
        str = str.replace(/\-/g, '+').replace(/_/g, '/');
        str = atob(str);
        return str;
    },

    // Base64 encode and make URL-friendly.
    encode: function(str) {
        str = btoa(str);
        return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/\=+$/, '');
    },

    getNotesLabelId: function(successcb) {
        if (GmailInterface.notesLabelId === undefined) {
            var notfoundcb = function() {
                GmailInterface.createNotesLabelId(successcb);
            };

            GmailInterface.loadNotesLabelId(successcb, notfoundcb);
        } else {
            successcb(GmailInterface.notesLabelId);
        }
    },

    createNotesLabelId: function(successcb) {
        var request = gapi.client.gmail.users.labels.create({
            'userId': 'me',
            'name': 'Notes'
        });

        request.execute(function(resp) {
            GmailInterface.notesLabelId = resp.id;
            successcb(GmailInterface.notesLabelId);
        });
    },

    loadNotesLabelId: function(successcb, notfoundcb) {
        var request = gapi.client.gmail.users.labels.list({
            'userId': 'me'
        });

        request.execute(function(resp) {

            for (i = 0; i < resp.labels.length; i++) {
                var label = resp.labels[i];

                if (label.name == "Notes") {
                    GmailInterface.notesLabelId = label.id;
                    break;
                }
            }

            if (GmailInterface.notesLabelId === undefined) {
                notfoundcb();
            } else {
                successcb(GmailInterface.notesLabelId);
            }
        });
    },
 
    // Get all drafts from Gmail
    getDrafts: function(callback) {
        var request = gapi.client.gmail.users.drafts.list({
            'userId': 'me'
        });

        request.execute(function(resp) {
            if (resp.drafts) {
                callback(resp.drafts);
            }
        });
    },

    // Get the labelIds, date and snippet for a Gmail message
    getDraftSnippet: function(draftId, messageId, callback) {
        var request = gapi.client.gmail.users.messages.get({
            'userId': 'me',
            'id': messageId,
            'fields': 'id,internalDate,labelIds,snippet'
        });

        request.execute(function(resp) {
            callback(draftId, messageId, resp.internalDate, resp.labelIds, resp.snippet);
        });
    },

    // Get all the note snippets, fires a callback for each note
    getNoteSnippets: function(callback) {
        // Get the labelId for Notes
        GmailInterface.getNotesLabelId(function(notesLabelId) {

            var noteSnippetCallback = function(draftId, messageId, internalDate, labelIds, snippet) {
                // Fire the callback if this draft is labeled with the 'notes' labelId
                if ($.inArray(notesLabelId, labelIds) >= 0) {
                    callback(draftId, messageId, internalDate, snippet);
                }
            };

            // Get the list of drafts
            GmailInterface.getDrafts(function(drafts) {
                for (i = 0; i < drafts.length; i++) {
                    // Get the labelIds and snippet for this draft
                    GmailInterface.getDraftSnippet(drafts[i].id, drafts[i].message.id, noteSnippetCallback);
                }
            });
        });
    },

    // Retrieves the message body as plain text from the draft response
    getDraftBody: function(messagePayload) {
        var body = {};

        if (messagePayload.mimeType == "multipart/alternative") {
            for (i = 0; i < messagePayload.parts.length; i++) {
                if (messagePayload.parts[i].mimeType == "text/plain") {
                    body = messagePayload.parts[i].body;
                }
            }
        } else {
            body = messagePayload.body;
        }

        return GmailInterface.decode(body.data);
    },

    // Retrieves the draft content from Gmail
    getDraft: function(draftId, successcb, errorcb) {
        var request = gapi.client.gmail.users.drafts.get({
            'userId': 'me',
            'id': draftId
        });

        request.execute(function(resp) {
            if (resp.error) {
                console.log(resp);
                errorcb("Unable to get draft. Received error communicating with Gmail.");
                return;
            }

            var draft_decoded = GmailInterface.getDraftBody(resp.message.payload);
            successcb(draft_decoded);
        });
    },

    createDraft: function(content, successcb, errorcb) {
        var draft_encoded = GmailInterface.encode("Subject: \r\n\r\n" + content);
        var request = gapi.client.gmail.users.drafts.create({
            'userId': 'me',
            'message': {
                'raw': draft_encoded
            }
        });

        request.execute(function(resp) {
            if (resp.error) {
                console.log(resp);
                errorcb("Unable to create draft. Received error communicating with Gmail.");
                return;
            }

            console.log(resp);

            var labelsuccesscb = function() {
                successcb(resp.id);
            };

            var messageId = resp.message.id;
            GmailInterface.setMessageLabel(messageId, labelsuccesscb);
        });
    },

    updateDraft: function(draftId, content, successcb, errorcb) {
        var draft_encoded = GmailInterface.encode("Subject: \r\n\r\n" + content);
        var request = gapi.client.gmail.users.drafts.update({
            'userId': 'me',
            'id': draftId,
            'message': {
                'raw': draft_encoded
            },
            'send': false
        });

        request.execute(function(resp) {
            if (resp.error) {
                console.log(resp);
                errorcb("Unable to update draft. Received error communicating with Gmail.");
                return;
            }

            var messageId = resp.message.id;
            GmailInterface.setMessageLabel(messageId, successcb);
        });
    },

    insertMessage: function(content, successcb, errorcb) {
        var email = "X-Uniform-Type-Identifier: com.apple.mail-note\r\n";
        email += "X-Universally-Unique-Identifier: " + generateUUID() + "\r\n";
        email += "Subject: mdnote\r\n";
        email += "\r\n";
        email += content;

        var message_encoded = GmailInterface.encode(email);
        console.log(message_encoded);

        var request = gapi.client.gmail.users.messages.insert({
            'userId': 'me',
            'raw': message_encoded
        });

        request.execute(function(resp) {
            console.log(resp);

            var messageId = resp.id;
            GmailInterface.setMessageLabel(messageId, successcb);
        });
    },

    setMessageLabel: function(messageId, successcb) {
        // Get the labelId for Notes
        GmailInterface.getNotesLabelId(function(notesLabelId) {
            var request = gapi.client.gmail.users.messages.modify({
                'userId': 'me',
                'id': messageId,
                'addLabelIds': [notesLabelId]
            });

            request.execute(function(resp) {
                successcb();
            });
        });
    }
};

var MyApp = angular.module('MyApp', ['ui.router', 'ui.bootstrap.buttons', 'ui.codemirror', 'moof2k.wysimd']);

MyApp.config(function($stateProvider, $urlRouterProvider) {
    $urlRouterProvider.otherwise("/");

    $stateProvider
    .state('init', {
        url: "/",
        views: {
            "error": {
                templateUrl: "error.html",
                controller: "ErrorController"
            },
            "notes": {
                template: "init notes",
                controller: function($scope, $state) {
                    console.log('init notes controller');
                    $state.go('notes');
                }
            },
            "note": {
                template: "init note"
            },
            "splash": {
                templateUrl: "note.html",
                controller: 'NoteController'
            }
        },
    })
    .state('notes', {
        url: "/notes",
        views: {
            "error": {
                templateUrl: "error.html",
                controller: "ErrorController"
            },
            "notes": {
                templateUrl: "notes.html",
                controller: 'NotesController'
            },
            "note": {
                templateUrl: "note.html",
                controller: 'NoteController'
            }
        },
    })
    .state('note', {
        url: "/notes/:draftId",
        views: {
            "error": {
                templateUrl: "error.html",
                controller: "ErrorController"
            },
            "notes": {
                templateUrl: "notes.html",
                controller: 'NotesController'
            },
            "note": {
                templateUrl: "note.html",
                controller: 'NoteController'
            }
        },
    });
});

MyApp.controller('AuthController', function($scope, $state, $window, $timeout) {
    $scope.authorized = undefined;
    $scope.notesLabelId = undefined;
    $scope.error = false;

    function isAuthorized(a) {
        if (a === false) {
        }
        $timeout(function() {
            $scope.authorized = a;
        });
    }

    $window.init = function() {
        GmailInterface.authorize(true, isAuthorized);
    };

    if (window.location.hash.endsWith("/test")) {
        $scope.authorized = true;
    }

    $scope.handleAuthClick = function() {
        GmailInterface.authorize(false, isAuthorized);
    };

    $scope.displayError = function(message) {
        $timeout(function() {
            $scope.error = message;
        });
    };

    $scope.newNote = function() {
        var successcb = function(draftId) {
            $timeout(function() {
                $state.go('note', {'draftId': draftId});
            });
        };

        var initial = "# New Note\n\nToday I think I will buy a boat.";

        GmailInterface.createDraft(initial, successcb, $scope.displayError);
    };

});

MyApp.controller('ErrorController', function($scope, $timeout) {

});


MyApp.controller('NotesController', function($scope, $timeout) {
    $scope.notes = [];

    function addNote(draftId, messageId, messageTimestamp, messageSnippet) {
        // This function may be called in response to a data load callback so wrap in a timeout
        // so the scope can get updated.
        $timeout(function() {
            console.log(messageSnippet);
            $scope.notes.push({
                'messageId': messageId,
                'draftId': draftId,
                'time': new Date(parseInt(messageTimestamp)),
                'snippet': messageSnippet
            });
        });
    }

    $scope.dateToDisplayDateString = function(date) {

        var seconds = Math.floor((new Date() - date) / 1000);

        var interval = Math.floor(seconds / 86400);
        if (interval > 6) {
            return date.toLocaleDateString();
        } else if (interval > 1) {
            return interval + " days ago";
        }
        interval = Math.floor(seconds / 3600);
        if (interval > 1) {
            return interval + " hours ago";
        }
        interval = Math.floor(seconds / 60);
        if (interval > 1) {
            return interval + " minutes ago ";
        }
        return "just a moment ago";
    };

    if (!window.location.hash.endsWith("/test")) {
        GmailInterface.getNoteSnippets(addNote);
    } else {
        addNote('test', 'test', 0, 'test note');
    }
});


MyApp.controller('NoteController', function($scope, $stateParams, $timeout) {
    $scope.note = {
        'model': "foo",
        'editable': true,
        'id': 0
    };

    $scope.editorOptions = {
        lineWrapping : true,
        lineNumbers: true,
        viewportMargin: Infinity,
        theme: "xq-light"
    };

    $scope.note_control = {};
    $scope.editmode = 'right';
    $scope.note_data = undefined;
    $scope.note_data_ls = undefined;

    function setNote(noteData) {
        $timeout(function() {
            $scope.note_data = noteData;
        });
    }

    $scope.updateDraft = function() {
        var successcb = function() {
        };

        GmailInterface.updateDraft($stateParams.draftId, $scope.note_data, successcb, $scope.displayError);
        //GmailInterface.insertMessage($scope.note_data, successcb, $scope.displayError);
    };

    $scope.$watch('note_data', function() {
        if ($scope.note_data != $scope.note_data_ls) {
            LSInterface.updateDraft($stateParams.draftId, $scope.note_data, function() {}, function() {});
            $scope.note_data_ls = $scope.note_data;
        }
    });

    $scope.$watch('editmode', function() {

        // The CodeMirror doesn't refresh automatically, set a timeout to refresh it.
        $timeout(function() {
            window.dispatchEvent(new Event('resize'));
        }, 200);
    });

    if ($scope.authorized && $stateParams.draftId !== undefined) {
        GmailInterface.getDraft($stateParams.draftId, setNote, $scope.displayError);
        $scope.spellcheck = true;
        $scope.container_style = "";
    } else if ($scope.authorized && $stateParams.draftId === undefined) {
        setNote(userNote);
        $scope.spellcheck = false;
        $scope.container_style = "";
    } else {
        setNote(splashNote);
        $scope.spellcheck = false;
        $scope.container_style = "padding-top: 125px";
    }
});

var userNote = `
# mdnote

You're logged in. Click the + icon in the top-left to create a new note.

## Markdown formatting

### Font styles

Surround text with \*\*asterisks\*\* to make **bold text**.

Surround text with \_underscores\_ to make **italic text**.

Surround text with \\\`asterisks\\\` to make \`fixed-width text\`.

### Links and images

Insert a link using \\[name\\]\\(url\\).

Insert an image using !\\[\\]\\(url\\).

### Headings

Headings may be controlled by prefacing a paragraph with #, ##, ### or ####.

### Lists

* Prefix a paragraph with \*
* to create
    * a bulleted list

1. Prefix with 1.
1. to create
    1. a numbered list

### Blockquotes

Prefix a paragraph with > to have it display as a blockquote.

> "A blockquote example"
>
> --_important demonstration_

### Preformatted

Prefix a paragraph with four spaces to have it display as a large preformatted text block.

    #include <stdio.h>

    int main() {
        ...
    }

### Tables

mdnote supports [Maruku table syntax](http://maruku.rubyforge.org/maruku.html#extra).

| Heading A | Heading B |
|-----------|-----------|
| Cell 1 | Cell 2|
| Cell 3 | Cell 4 |

### A note on converting between rich text and Markdown

When converting from Markdown to rich text, mdnote can parse most any text that complies with classic Markdown.

When converting from rich text to Markdown it gets a little tricky. Two reasons: Markdown
allows for several ways to represent the same text (example: \\\`\\\`foo\\\`\\\` is equivalent
to \\\`foo\\\`), and rich text (HTML) is much more expressive than Markdown. For these
reasons mdnote follows a strict convention when converting from rich text to HTML.
You may notice if you write in Markdown, switch to HTML, then switch back to Markdown
mdnote will have "sanitized" your Markdown slightly.
`;

var splashNote = `
# **mdnote**

A simple note taking application for the web. Click _Login_ to get started.

## Backed by Gmail

All of your notes are stored and secured online in your Gmail account. Access them anytime you're online using this app or by visiting your Gmail account directly.

## A unique text editor

**mdnote** employs a hybrid rich-text editor to provide both a  _[what-you-see-is-what-you-get](https://en.wikipedia.org/wiki/WYSIWYG)_ and _[Markdown](https://en.wikipedia.org/wiki/Markdown)_ text editing experience.

Sometimes you want Markdown, sometimes you want a rich text editor. **mdnote** gives you both, simultaneously, in real-time. Try it now by clicking the panel switchers in the top-right corner.

## Open source, free software

**mdnote** is open source and provided to you free of charge.

Developers: Source code is available on GitHub.
`;
