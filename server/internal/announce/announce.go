// Package announce gives the site a name of its own on the local network, like recipes.local. Avahi, the
// program that already answers when a phone asks for j-desktop.local, answers for the site's name too, with
// this machine's address, for as long as the site runs.
package announce

import (
	"context"
	"fmt"
	"io"
	"net"
	"slices"
	"strings"
	"time"
)

// Interval is how often the announcement is checked. A check costs almost nothing, and it's what notices
// that the network came up after the site did, that Avahi restarted and forgot the name, or that the
// router handed this machine a new address.
const Interval = 10 * time.Second

// Address is one place other devices can reach this machine: an IPv4 address on one network interface.
type Address struct {
	// Interface is the network interface's index. Avahi announces each address only on its own network,
	// so a phone is never handed an address it has no way to reach.
	Interface int

	// IP is the address itself, like 192.168.50.19.
	IP string
}

// State is how an announcement is going, as far as Avahi says.
type State int

const (
	// Registering means Avahi is still making sure no other device answers to the name, which takes it
	// about a second.
	Registering State = iota

	// Established means Avahi is answering for the name.
	Established

	// Collision means another device on the network already answers to the name.
	Collision

	// Lost means Avahi isn't announcing the name anymore: it failed to, or it restarted and forgot it.
	Lost
)

// Avahi is the part of the Avahi daemon an Announcer talks to. It's DBus everywhere but the tests.
type Avahi interface {
	// Publish starts announcing name at every one of addresses, and returns the announcement.
	Publish(name string, addresses []Address) (Group, error)
}

// Group is one announcement Avahi holds: one name, at a set of addresses.
type Group interface {
	// State says how the announcement is going.
	State() State

	// Withdraw stops announcing the name.
	Withdraw()
}

// Announcer keeps one name announced at this machine's current addresses.
type Announcer struct {
	name   string
	avahi  Avahi
	stdout io.Writer
	stderr io.Writer

	// addresses lists where other devices can reach this machine. It's LocalAddresses everywhere but the
	// tests, which decide where the machine is.
	addresses func() ([]Address, error)

	// interval is how long Run waits between checks. It's Interval everywhere but the tests.
	interval time.Duration

	// group is the announcement Avahi holds right now, and published is the addresses it was made with.
	group     Group
	published []Address

	// reported is the last thing written to the log, so a situation that lasts is written once rather than
	// on every check.
	reported string
}

// New returns an announcer for name, writing what it does to stdout and what goes wrong to stderr. Nothing
// is announced until the first check.
func New(name string, avahi Avahi, stdout io.Writer, stderr io.Writer) *Announcer {
	return &Announcer{
		name:      name,
		avahi:     avahi,
		stdout:    stdout,
		stderr:    stderr,
		addresses: LocalAddresses,
		interval:  Interval,
	}
}

// Run checks the announcement right away and then every interval, until ctx ends. Ending withdraws the
// name, though it rarely gets the chance: the site normally stops by its process ending, and Avahi
// withdraws the name by itself when the process's connection to it closes.
func (announcer *Announcer) Run(ctx context.Context) {
	ticker := time.NewTicker(announcer.interval)
	defer ticker.Stop()
	defer announcer.withdraw()

	// the loop asks before every check, since a tick and the end can arrive together.
	for ctx.Err() == nil {
		announcer.Check()
		select {
		case <-ticker.C:
		case <-ctx.Done():
		}
	}
}

// Check brings the announcement up to date once. It announces the name if it isn't announced yet, again if
// the machine's addresses changed or Avahi stopped answering for it, and withdraws it while the machine has
// no address to give out.
func (announcer *Announcer) Check() {
	addresses, err := announcer.addresses()
	if err != nil {
		announcer.withdraw()
		announcer.report(announcer.stderr, fmt.Sprintf("Couldn't list this machine's network addresses: %v", err))
		return
	}

	// at boot the site can start before the network does, and there's nothing to announce until it's up.
	if len(addresses) == 0 {
		announcer.withdraw()
		announcer.report(announcer.stdout, fmt.Sprintf("Waiting for a network address before announcing %s.", announcer.name))
		return
	}

	// an announcement at the addresses the machine still has only needs watching, unless Avahi gave up on it.
	if announcer.group != nil && slices.Equal(addresses, announcer.published) {
		switch announcer.group.State() {
		case Registering:
			return
		case Established:
			announcer.report(announcer.stdout, fmt.Sprintf("Announcing %s at %s.", announcer.name, listIPs(addresses)))
			return
		case Collision:
			announcer.report(announcer.stderr, fmt.Sprintf("Another device on the network already answers to %s. Trying again.", announcer.name))
		case Lost:
			announcer.report(announcer.stderr, fmt.Sprintf("Avahi stopped announcing %s. Announcing it again.", announcer.name))
		}
	}

	// anything else means starting over: a first announcement, a new address, or one Avahi gave up on.
	announcer.withdraw()
	group, err := announcer.avahi.Publish(announcer.name, addresses)
	if err != nil {
		announcer.report(announcer.stderr, fmt.Sprintf("Couldn't announce %s: %v", announcer.name, err))
		return
	}
	announcer.group = group
	announcer.published = addresses
}

// withdraw stops the current announcement, if there is one.
func (announcer *Announcer) withdraw() {
	if announcer.group == nil {
		return
	}
	announcer.group.Withdraw()
	announcer.group = nil
	announcer.published = nil
}

// report writes message to writer unless it's the last thing reported, so the log says when something
// changed without repeating itself every check.
func (announcer *Announcer) report(writer io.Writer, message string) {
	if message == announcer.reported {
		return
	}
	announcer.reported = message
	fmt.Fprintln(writer, message)
}

// listIPs words a set of addresses for the log, like 192.168.50.19, 10.0.0.7.
func listIPs(addresses []Address) string {
	ips := []string{}
	for _, address := range addresses {
		ips = append(ips, address.IP)
	}
	return strings.Join(ips, ", ")
}

// LocalAddresses lists the IPv4 addresses other devices on the network can reach this machine at. IPv4 alone
// covers every phone and laptop on a home network, so IPv6 addresses are left out.
func LocalAddresses() ([]Address, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}

	candidates := []candidate{}
	for _, networkInterface := range interfaces {
		addresses, err := networkInterface.Addrs()
		if err != nil {
			return nil, err
		}
		candidates = append(candidates, candidate{
			index:     networkInterface.Index,
			flags:     networkInterface.Flags,
			addresses: addresses,
		})
	}
	return reachable(candidates), nil
}

// candidate is one network interface, as the operating system describes it.
type candidate struct {
	index     int
	flags     net.Flags
	addresses []net.Addr
}

// reachable picks the addresses other devices can reach out of every interface's addresses.
func reachable(candidates []candidate) []Address {
	found := []Address{}
	for _, candidate := range candidates {
		// skip networks that are switched off or unplugged, loopback, which only ever reaches this machine,
		// and links like VPN tunnels that can't carry the multicast Avahi announces with.
		up := candidate.flags&net.FlagUp != 0 && candidate.flags&net.FlagRunning != 0
		loopback := candidate.flags&net.FlagLoopback != 0
		multicast := candidate.flags&net.FlagMulticast != 0
		if up == false || loopback || multicast == false {
			continue
		}

		for _, address := range candidate.addresses {
			network, isNetwork := address.(*net.IPNet)
			if isNetwork == false {
				continue
			}

			// a 169.254 address is one a machine gives itself when nothing answered it, so nothing else can
			// count on reaching it there.
			ip := network.IP.To4()
			if ip == nil || ip.IsLinkLocalUnicast() {
				continue
			}
			found = append(found, Address{Interface: candidate.index, IP: ip.String()})
		}
	}
	return found
}
