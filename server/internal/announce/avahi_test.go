package announce

import (
	"errors"
	"reflect"
	"testing"

	"github.com/godbus/dbus/v5"
)

// publishOn owes Avahi exactly the calls avahi-publish would make, with the argument types Avahi's D-Bus
// interface insists on, and owes the network no half-made announcement when Avahi refuses any part of one.
// dbusGroup owes the announcer an honest reading of what Avahi says about the announcement.

// call is one D-Bus method call, as the fake Avahi saw it.
type call struct {
	path   dbus.ObjectPath
	method string
	args   []any
}

// fakeBus stands in for the Avahi daemon's objects, keeping every call they were sent.
type fakeBus struct {
	calls []call

	// fails maps a method to the error Avahi answers it with.
	fails map[string]error

	// state is what GetState answers with.
	state int32
}

// objects returns the fake object at path, the way the connection's Object would.
func (bus *fakeBus) objects(path dbus.ObjectPath) dbus.BusObject {
	return &fakeObject{bus: bus, path: path}
}

// fakeObject is one object on a fakeBus. Only Call is implemented, since it's the only thing this package
// asks of an object.
type fakeObject struct {
	dbus.BusObject

	bus  *fakeBus
	path dbus.ObjectPath
}

// Call implements dbus.BusObject, answering the way Avahi does.
func (object *fakeObject) Call(method string, flags dbus.Flags, args ...any) *dbus.Call {
	object.bus.calls = append(object.bus.calls, call{path: object.path, method: method, args: args})
	if err, failing := object.bus.fails[method]; failing {
		return &dbus.Call{Err: err}
	}

	switch method {
	case "org.freedesktop.Avahi.Server.EntryGroupNew":
		return &dbus.Call{Body: []any{dbus.ObjectPath("/Client1/EntryGroup1")}}
	case "org.freedesktop.Avahi.EntryGroup.GetState":
		return &dbus.Call{Body: []any{object.bus.state}}
	}
	return &dbus.Call{}
}

// twoNetworks is a machine on two networks at once, like wired and Wi-Fi.
var twoNetworks = []Address{{Interface: 2, IP: "192.168.50.19"}, {Interface: 3, IP: "10.0.0.7"}}

// the calls publishOn makes, as a test expects them.
var (
	newGroup = call{path: "/", method: "org.freedesktop.Avahi.Server.EntryGroupNew"}
	addWired = call{
		path:   "/Client1/EntryGroup1",
		method: "org.freedesktop.Avahi.EntryGroup.AddAddress",
		args:   []any{int32(2), int32(-1), uint32(16), "recipes.local", "192.168.50.19"},
	}
	addWireless = call{
		path:   "/Client1/EntryGroup1",
		method: "org.freedesktop.Avahi.EntryGroup.AddAddress",
		args:   []any{int32(3), int32(-1), uint32(16), "recipes.local", "10.0.0.7"},
	}
	commit = call{path: "/Client1/EntryGroup1", method: "org.freedesktop.Avahi.EntryGroup.Commit"}
	free   = call{path: "/Client1/EntryGroup1", method: "org.freedesktop.Avahi.EntryGroup.Free"}
)

// assertCalls fails the test unless the bus got exactly these calls, in order.
func assertCalls(t *testing.T, bus *fakeBus, expected ...call) {
	t.Helper()

	if reflect.DeepEqual(bus.calls, expected) == false {
		t.Fatalf("got calls %+v, expected %+v", bus.calls, expected)
	}
}

// TestPublishOnMakesAGroupAddsEachAddressAndCommits covers a machine on two networks, announced in full.
func TestPublishOnMakesAGroupAddsEachAddressAndCommits(t *testing.T) {
	// Arrange.
	bus := &fakeBus{}

	// Act.
	group, err := publishOn(bus.objects, "recipes.local", twoNetworks)

	// Assert.
	if err != nil || group == nil {
		t.Fatalf("got %v %v", group, err)
	}
	assertCalls(t, bus, newGroup, addWired, addWireless, commit)
}

// TestPublishOnFailsWhenAvahiWontMakeAGroup covers Avahi refusing the very first call, as when it isn't
// running.
func TestPublishOnFailsWhenAvahiWontMakeAGroup(t *testing.T) {
	// Arrange.
	refusal := errors.New("the name org.freedesktop.Avahi was not provided by any .service files")
	bus := &fakeBus{fails: map[string]error{"org.freedesktop.Avahi.Server.EntryGroupNew": refusal}}

	// Act.
	_, err := publishOn(bus.objects, "recipes.local", twoNetworks)

	// Assert.
	if errors.Is(err, refusal) == false {
		t.Fatalf("got %v, expected the refusal", err)
	}
	assertCalls(t, bus, newGroup)
}

// TestPublishOnFreesTheGroupWhenAnAddressIsRefused covers Avahi refusing an address, which leaves nothing
// half made behind and goes no further.
func TestPublishOnFreesTheGroupWhenAnAddressIsRefused(t *testing.T) {
	// Arrange.
	refusal := errors.New("invalid address")
	bus := &fakeBus{fails: map[string]error{"org.freedesktop.Avahi.EntryGroup.AddAddress": refusal}}

	// Act.
	_, err := publishOn(bus.objects, "recipes.local", twoNetworks)

	// Assert.
	if errors.Is(err, refusal) == false {
		t.Fatalf("got %v, expected the refusal", err)
	}
	assertCalls(t, bus, newGroup, addWired, free)
}

// TestPublishOnFreesTheGroupWhenCommitFails covers Avahi refusing the commit.
func TestPublishOnFreesTheGroupWhenCommitFails(t *testing.T) {
	// Arrange.
	refusal := errors.New("not permitted")
	bus := &fakeBus{fails: map[string]error{"org.freedesktop.Avahi.EntryGroup.Commit": refusal}}

	// Act.
	_, err := publishOn(bus.objects, "recipes.local", twoNetworks)

	// Assert.
	if errors.Is(err, refusal) == false {
		t.Fatalf("got %v, expected the refusal", err)
	}
	assertCalls(t, bus, newGroup, addWired, addWireless, commit, free)
}

// stateOf returns what a group reads when Avahi reports the given entry group state.
func stateOf(state int32) State {
	bus := &fakeBus{state: state}
	group := &dbusGroup{object: bus.objects("/Client1/EntryGroup1")}
	return group.State()
}

// TestStateReadsRegistering covers Avahi still probing the name.
func TestStateReadsRegistering(t *testing.T) {
	// Arrange.
	registering := int32(1)

	// Act.
	state := stateOf(registering)

	// Assert.
	if state != Registering {
		t.Fatalf("got %d, expected Registering", state)
	}
}

// TestStateReadsEstablished covers Avahi answering for the name.
func TestStateReadsEstablished(t *testing.T) {
	// Arrange.
	established := int32(2)

	// Act.
	state := stateOf(established)

	// Assert.
	if state != Established {
		t.Fatalf("got %d, expected Established", state)
	}
}

// TestStateReadsCollision covers another device already answering to the name.
func TestStateReadsCollision(t *testing.T) {
	// Arrange.
	collision := int32(3)

	// Act.
	state := stateOf(collision)

	// Assert.
	if state != Collision {
		t.Fatalf("got %d, expected Collision", state)
	}
}

// TestStateReadsAFailureAsLost covers Avahi failing to announce the group.
func TestStateReadsAFailureAsLost(t *testing.T) {
	// Arrange.
	failure := int32(4)

	// Act.
	state := stateOf(failure)

	// Assert.
	if state != Lost {
		t.Fatalf("got %d, expected Lost", state)
	}
}

// TestStateReadsAGroupAvahiForgotAsLost covers asking about a group Avahi no longer has, as after it
// restarts.
func TestStateReadsAGroupAvahiForgotAsLost(t *testing.T) {
	// Arrange- an established group, so only the failed call can make it read as lost.
	bus := &fakeBus{
		state: 2,
		fails: map[string]error{"org.freedesktop.Avahi.EntryGroup.GetState": errors.New("no such object")},
	}
	group := &dbusGroup{object: bus.objects("/Client1/EntryGroup1")}

	// Act.
	state := group.State()

	// Assert.
	if state != Lost {
		t.Fatalf("got %d, expected Lost", state)
	}
}

// TestWithdrawFreesTheGroup covers taking the name off the network.
func TestWithdrawFreesTheGroup(t *testing.T) {
	// Arrange.
	bus := &fakeBus{}
	group := &dbusGroup{object: bus.objects("/Client1/EntryGroup1")}

	// Act.
	group.Withdraw()

	// Assert.
	assertCalls(t, bus, free)
}
