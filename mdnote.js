
function onGapiLoaded() {

    window.init();
}

var CLIENT_ID = '468212145523-8qedsjk185kkrobrstgtroqqs6oufjbl.apps.googleusercontent.com';
var SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

var MyApp = angular.module('MyApp', ['ui.router', 'moof2k.wysimd']);

MyApp.config(function($stateProvider, $urlRouterProvider) {
    $urlRouterProvider.otherwise("/");

    $stateProvider
    .state('init', {
        url: "/",
        views: {
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
        url: "/notes/:draftId",
        views: {
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

MyApp.controller('AuthController', function($scope, $state, $window) {
    $scope.authorized = false;

    function setAuthorized(a) {
        $scope.authorized = a;
        $scope.$apply();
    }

    function checkGapiAuth() {
        gapi.auth.authorize({
            'client_id': CLIENT_ID,
            'scope': SCOPES.join(' '),
            'immediate': true
        }, onGapiAuthResult);
    }

    function onGapiAuthResult(authResult) {
        console.log(authResult);
        if (authResult && !authResult.error) {
            $scope.$evalAsync(setAuthorized(true));
        } else {
            $scope.$evalAsync(setAuthorized(false));
        }
    }

    $window.init = function() {
        checkGapiAuth();
    };

    if (window.location.hash.endsWith("/test")) {
        $scope.authorized = true;
    }

});


MyApp.controller('NotesController', function($scope) {
    $scope.notes = [];
    $scope.note = {
        'model': "foo",
        'editable': true,
        'id': 0
    };

    function addNote(draftId, messageId, messageTimestamp, messageSnippet) {
        console.log(messageSnippet);
        $scope.notes.push({
            'messageId': messageId,
            'draftId': draftId,
            'time': new Date(parseInt(messageTimestamp)),
            'snippet': messageSnippet
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

    function getNotesLabelId() {
        var request = gapi.client.gmail.users.labels.list({
            'userId': 'me'
        });

        request.execute(function(resp) {
            for (i = 0; i < resp.labels.length; i++) {
                var label = resp.labels[i];

                if (label.name == "Notes") {
                    $scope.notesLabelId = label.id;
                    console.log("notes label is " + label.id);
                    getDrafts();
                }
            }
        });
    }

    function getDrafts() {
        var request = gapi.client.gmail.users.drafts.list({
            'userId': 'me'
        });

        request.execute(function(resp) {
            for (i = 0; i < resp.drafts.length; i++) {
                var draft = resp.drafts[i];

                getDraftSnippet(draft.id, draft.message.id);
            }
        });
    }

    function getDraftSnippet(draftId, messageId) {
        console.log(draftId + " " + messageId);
        var request = gapi.client.gmail.users.messages.get({
            'userId': 'me',
            'id': messageId,
            'fields': 'id,internalDate,labelIds,snippet'
        });

        request.execute(function(resp) {
            if ($.inArray($scope.notesLabelId, resp.labelIds) >= 0) {
                $scope.$evalAsync(addNote(draftId, messageId, resp.internalDate, resp.snippet));
            }
        });
    }

    function onGmailLoaded() {
        console.log('onGmailLoaded Notes');
        getNotesLabelId();
    }

    console.log('NotesController');

    if (!window.location.hash.endsWith("/test")) {
        gapi.client.load('gmail', 'v1', onGmailLoaded);
    } else {
        addNote('test', 'test', 0, 'test note');
    }
});


MyApp.controller('NoteController', function($scope, $stateParams) {
    $scope.note = {
        'model': "foo",
        'editable': true,
        'id': 0
    };

    $scope.note_data = "";

    function getDraft() {
        var request = gapi.client.gmail.users.drafts.get({
            'userId': 'me',
            'id': $stateParams.draftId
        });

        request.execute(function(resp) {
            console.log(resp);
            $scope.note_data = atob(resp.message.payload.body.data);
        });
    }

    $scope.updateDraft = function() {
        var data = btoa("Subject: \r\n\r\n" + $scope.note_data);
        console.log(data);
        var request = gapi.client.gmail.users.drafts.update({
            'userId': 'me',
            'id': $stateParams.draftId,
                'message': {
                    'raw': data
                
            },
            'send': false
        });

        request.execute(function(resp) {
            console.log(resp);
        });
    };

    function onGmailLoaded() {
        console.log('onGmailLoaded Note');
        getDraft();
    }

    console.log('NoteController');

    if (!window.location.hash.endsWith("/test")) {
        gapi.client.load('gmail', 'v1', onGmailLoaded);
    } else {
        $scope.note_data = "# Test note\n\nHere is a test note";
    }
});


