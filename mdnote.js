
function onGapiLoaded() {

	window.init();
}

var CLIENT_ID = '468212145523-8qedsjk185kkrobrstgtroqqs6oufjbl.apps.googleusercontent.com';
var SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

var MyApp = angular.module('MyApp', ['ui.router', 'moof2k.wysimd']);

MyApp.config(function($stateProvider, $urlRouterProvider) {
	$urlRouterProvider.otherwise("/");

	$stateProvider
	.state('auth', {
		url: "/",
		templateUrl: "auth.html"
	})
	.state('notes', {
		url: "/notes",
		templateUrl: "notes.html",
		controller: 'NotesController'
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

});


MyApp.controller('NotesController', function($scope) {
	$scope.notes = {};
    $scope.note = {
    	'model': "foo",
    	'editable': true,
    	'id': 0
    };

    function addNote(messageId, messageTimestamp, messageSnippet) {
    	console.log(messageSnippet);
    	$scope.notes[messageId] = {
    		'time': new Date(parseInt(messageTimestamp)),
    		'snippet': messageSnippet
    	};
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

    function refreshNotes() {
    	var request = gapi.client.gmail.users.labels.list({
          	'userId': 'me'
        });

        request.execute(function(resp) {
			for (i = 0; i < resp.labels.length; i++) {
				var label = resp.labels[i];

				if (label.name == "Notes") {
			  		refreshNotesWithLabelId(label.id);
				}
			}
        });
    }

    function refreshNotesWithLabelId(notesLabelId) {
    	var request = gapi.client.gmail.users.messages.list({
			'userId': 'me',
			'labelIds': [notesLabelId]
        });

        request.execute(function(resp) {
			for (i = 0; i < resp.messages.length; i++) {
				var message = resp.messages[i];
				console.log(message);

				refreshNoteSnippet(message.id);
			}
        });
    }

    function refreshNoteSnippet(messageId) {
    	console.log(messageId);
        var request = gapi.client.gmail.users.messages.get({
			'userId': 'me',
			'id': messageId,
			'fields': 'id,internalDate,snippet'
        });

        request.execute(function(resp) {
        	console.log(resp);
        	$scope.$evalAsync(addNote(resp.id, resp.internalDate, resp.snippet));
        });
    }

    function onGmailLoaded() {
    	console.log('onGmailLoaded Notes');
    	$scope.$evalAsync(refreshNotes());
    }

    gapi.client.load('gmail', 'v1', onGmailLoaded);
});
