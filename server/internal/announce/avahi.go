package announce

import (
	"github.com/godbus/dbus/v5"
)

const (
	avahiService    = "org.freedesktop.Avahi"
	avahiServer     = avahiService + ".Server"
	avahiEntryGroup = avahiService + ".EntryGroup"

	// anyProtocol announces over both IPv4 and IPv6 multicast, the way Avahi announces the machine's own name.
	anyProtocol int32 = -1

	// noReverse keeps Avahi from also answering "which name has this address?" with the site's name. The
	// address already answers that with the machine's own name, and claiming it twice is a collision.
	noReverse uint32 = 16

	// the entry group states that mean something here, numbered the way Avahi numbers them.
	avahiRegistering int32 = 1
	avahiEstablished int32 = 2
	avahiCollision   int32 = 3
)

// DBus reaches the Avahi daemon over the system bus, the same way avahi-publish does. Any user may announce
// a name like this: the only thing Avahi keeps for root is renaming the machine itself.
type DBus struct {
	connection *dbus.Conn
}

// Publish implements Avahi. It connects to the system bus first when it has no working connection, so a
// bus that restarts is picked up again on the next check.
func (avahi *DBus) Publish(name string, addresses []Address) (Group, error) {
	if avahi.connection == nil || avahi.connection.Connected() == false {
		connection, err := dbus.ConnectSystemBus()
		if err != nil {
			return nil, err
		}
		avahi.connection = connection
	}

	objects := func(path dbus.ObjectPath) dbus.BusObject {
		return avahi.connection.Object(avahiService, path)
	}
	return publishOn(objects, name, addresses)
}

// publishOn asks Avahi for a new entry group, adds one address record per address, and commits the group,
// which is when Avahi starts announcing. objects returns the Avahi object at a path; it's the connection's
// Object everywhere but the tests. A group that fails partway is freed rather than left half made.
func publishOn(objects func(path dbus.ObjectPath) dbus.BusObject, name string, addresses []Address) (Group, error) {
	var path dbus.ObjectPath
	if err := objects("/").Call(avahiServer+".EntryGroupNew", 0).Store(&path); err != nil {
		return nil, err
	}
	group := &dbusGroup{object: objects(path)}

	for _, address := range addresses {
		call := group.object.Call(avahiEntryGroup+".AddAddress", 0,
			int32(address.Interface), anyProtocol, noReverse, name, address.IP)
		if call.Err != nil {
			group.Withdraw()
			return nil, call.Err
		}
	}

	if call := group.object.Call(avahiEntryGroup+".Commit", 0); call.Err != nil {
		group.Withdraw()
		return nil, call.Err
	}
	return group, nil
}

// dbusGroup is one entry group in the Avahi daemon.
type dbusGroup struct {
	object dbus.BusObject
}

// State implements Group. A group Avahi can't report on, as after Avahi restarts, is lost.
func (group *dbusGroup) State() State {
	var state int32
	if err := group.object.Call(avahiEntryGroup+".GetState", 0).Store(&state); err != nil {
		return Lost
	}

	switch state {
	case avahiRegistering:
		return Registering
	case avahiEstablished:
		return Established
	case avahiCollision:
		return Collision
	}

	// what's left is a group that was never committed or that failed, and Avahi announces neither.
	return Lost
}

// Withdraw implements Group. Freeing the group takes its name off the network. A group Avahi has already
// forgotten has nothing left to withdraw, so a failure here changes nothing.
func (group *dbusGroup) Withdraw() {
	group.object.Call(avahiEntryGroup+".Free", 0)
}
