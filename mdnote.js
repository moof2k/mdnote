
function onGapiLoaded() {

    window.init();
}

var CLIENT_ID = '468212145523-8qedsjk185kkrobrstgtroqqs6oufjbl.apps.googleusercontent.com';
var SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

var GmailInterface = {
    authorize: function(callback) {
        // invoke gmail authorization function
        gapi.auth.authorize({
            'client_id': CLIENT_ID,
            'scope': SCOPES.join(' '),
            'immediate': true
        }, function(authResult) {
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
        str = atob(str);
        return str;
    },

    // Base64 encode and make URL-friendly.
    encode: function(str) {
        str = btoa(str);
        return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/\=+$/, '');
    },

    getNotesLabelId: function(callback) {
        if (GmailInterface.notesLabelId === undefined) {
            GmailInterface.loadNotesLabelId(callback);
        } else {
            callback(GmailInterface.notesLabelId);
        }
    },

    loadNotesLabelId: function(callback) {
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

            callback(GmailInterface.notesLabelId);
        });
    },
 
    // Get all drafts from Gmail
    getDrafts: function(callback) {
        var request = gapi.client.gmail.users.drafts.list({
            'userId': 'me'
        });

        request.execute(function(resp) {
            callback(resp.drafts);
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
    getDraft: function(draftId, callback) {
        var request = gapi.client.gmail.users.drafts.get({
            'userId': 'me',
            'id': draftId
        });

        request.execute(function(resp) {
            var draft_decoded = GmailInterface.getDraftBody(resp.message.payload);
            callback(draft_decoded);
        });
    },

    updateDraft: function(draftId, content, errorcb) {
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
            }

            var messageId = resp.message.id;
            GmailInterface.setMessageLabel(messageId);
        });
    },

    setMessageLabel: function(messageId) {
        // Get the labelId for Notes
        GmailInterface.getNotesLabelId(function(notesLabelId) {
            var request = gapi.client.gmail.users.messages.modify({
                'userId': 'me',
                'id': messageId,
                'addLabelIds': [notesLabelId]
            });

            request.execute(function(resp) {
            });
        });
    }
};

var MyApp = angular.module('MyApp', ['ui.router', 'ui.bootstrap.buttons', 'ui.layout', 'ui.codemirror', 'moof2k.wysimd']);

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
                template: "No note selected"
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
    $scope.authorized = false;
    $scope.notesLabelId = undefined;
    $scope.error = false;

    function isAuthorized(a) {
        $timeout(function() {
            $scope.authorized = a;
        });
    }

    $window.init = function() {
        GmailInterface.authorize(isAuthorized);
    };

    if (window.location.hash.endsWith("/test")) {
        $scope.authorized = true;
    }

    $scope.displayError = function(message) {
        $timeout(function() {
            $scope.error = message;
        });
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
        return Math.floor(seconds) + " seconds ago";
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
    $scope.note_data = "";

    function setNote(noteData) {
        $timeout(function() {
            $scope.note_data = noteData;
        });
    }

    $scope.updateDraft = function() {
        GmailInterface.updateDraft($stateParams.draftId, $scope.note_data, $scope.displayError);
    };

    $scope.$watch('editmode', function() {

        if($scope.editmode == "both") {
            document.getElementById('editable_bothleft').appendChild(document.getElementById('editable_md'));
            document.getElementById('editable_bothright').appendChild(document.getElementById('editable_html'));
        } else {
            document.getElementById('editable_singleleft').appendChild(document.getElementById('editable_md'));
            document.getElementById('editable_singleright').appendChild(document.getElementById('editable_html'));
        }

        // The CodeMirror doesn't refresh automatically, set a timeout to refresh it.
        $timeout(function() {
            window.dispatchEvent(new Event('resize'));
        }, 200);
    });

    if (!window.location.hash.endsWith("/test")) {
        GmailInterface.getDraft($stateParams.draftId, setNote);
    } else {
        setNote("# Test note\n\nHere is a test note");
    }
});


