package announce

import (
	"bytes"
	"context"
	"errors"
	"net"
	"slices"
	"testing"
	"time"
)

// Announcer owes the site a name phones can always find: announced as soon as the machine has an address,
// announced again whenever the address moves or Avahi gives up on it, and withdrawn while there's no address
// to give out. It owes the log one line per change, never the same line on every check.

// lan is the machine on a home network, and moved is the same machine after the router hands it a new
// address on the same network.
var (
	lan   = []Address{{Interface: 2, IP: "192.168.50.19"}}
	moved = []Address{{Interface: 2, IP: "192.168.50.23"}}
)

// fakeAvahi stands in for the Avahi daemon, keeping every announcement it was asked for.
type fakeAvahi struct {
	names     []string
	published [][]Address
	groups    []*fakeGroup

	// failure, when set, is what every Publish fails with.
	failure error
}

// Publish implements Avahi.
func (avahi *fakeAvahi) Publish(name string, addresses []Address) (Group, error) {
	avahi.names = append(avahi.names, name)
	if avahi.failure != nil {
		return nil, avahi.failure
	}

	group := &fakeGroup{state: Registering}
	avahi.published = append(avahi.published, addresses)
	avahi.groups = append(avahi.groups, group)
	return group, nil
}

// fakeGroup is one announcement in a fakeAvahi.
type fakeGroup struct {
	state     State
	withdrawn bool
}

// State implements Group.
func (group *fakeGroup) State() State {
	return group.state
}

// Withdraw implements Group.
func (group *fakeGroup) Withdraw() {
	group.withdrawn = true
}

// rig is an announcer for recipes.local over a fake Avahi, with the machine's addresses in the test's hands
// and everything the announcer wrote.
type rig struct {
	announcer *Announcer
	avahi     *fakeAvahi
	addresses []Address
	failure   error
	stdout    *bytes.Buffer
	stderr    *bytes.Buffer
}

// newRig returns a rig for a machine at addresses.
func newRig(addresses []Address) *rig {
	built := &rig{avahi: &fakeAvahi{}, addresses: addresses, stdout: &bytes.Buffer{}, stderr: &bytes.Buffer{}}
	built.announcer = New("recipes.local", built.avahi, built.stdout, built.stderr)
	built.announcer.addresses = func() ([]Address, error) {
		return built.addresses, built.failure
	}
	return built
}

// establishedRig returns a rig whose first announcement Avahi has finished registering, with the line that
// reports it already written and cleared away.
func establishedRig(t *testing.T) *rig {
	t.Helper()

	established := newRig(lan)
	established.announcer.Check()
	established.avahi.groups[0].state = Established
	established.announcer.Check()
	if established.stdout.String() != "Announcing recipes.local at 192.168.50.19.\n" {
		t.Fatalf("setting up, got %q", established.stdout.String())
	}
	established.stdout.Reset()
	return established
}

// assertPublished fails the test unless Avahi was asked for exactly these announcements, in order.
func assertPublished(t *testing.T, avahi *fakeAvahi, expected ...[]Address) {
	t.Helper()

	matches := len(avahi.published) == len(expected)
	for index := 0; matches && index < len(expected); index++ {
		matches = slices.Equal(avahi.published[index], expected[index])
	}
	if matches == false {
		t.Fatalf("published %v, expected %v", avahi.published, expected)
	}
}

// TestCheckAnnouncesTheNameAtTheMachinesAddresses covers the first check on a machine that's on the network.
func TestCheckAnnouncesTheNameAtTheMachinesAddresses(t *testing.T) {
	// Arrange.
	announcing := newRig(lan)

	// Act.
	announcing.announcer.Check()

	// Assert- nothing is reported until Avahi says the name is established.
	if slices.Equal(announcing.avahi.names, []string{"recipes.local"}) == false {
		t.Fatalf("announced %v, expected recipes.local", announcing.avahi.names)
	}
	assertPublished(t, announcing.avahi, lan)
	if announcing.stdout.String() != "" || announcing.stderr.String() != "" {
		t.Fatalf("wrote %q and %q", announcing.stdout.String(), announcing.stderr.String())
	}
}

// TestCheckWaitsWhileAvahiRegisters covers a check during the second or so Avahi spends making sure no other
// device has the name.
func TestCheckWaitsWhileAvahiRegisters(t *testing.T) {
	// Arrange.
	announcing := newRig(lan)
	announcing.announcer.Check()

	// Act.
	announcing.announcer.Check()

	// Assert.
	assertPublished(t, announcing.avahi, lan)
	if announcing.avahi.groups[0].withdrawn {
		t.Fatal("withdrew an announcement that was still registering")
	}
}

// TestCheckReportsAnEstablishedNameOnce covers checks after Avahi has established the name, which report it
// the first time and stay quiet after that.
func TestCheckReportsAnEstablishedNameOnce(t *testing.T) {
	// Arrange.
	announcing := newRig(lan)
	announcing.announcer.Check()
	announcing.avahi.groups[0].state = Established

	// Act.
	announcing.announcer.Check()
	announcing.announcer.Check()

	// Assert.
	assertPublished(t, announcing.avahi, lan)
	if announcing.stdout.String() != "Announcing recipes.local at 192.168.50.19.\n" {
		t.Fatalf("wrote %q", announcing.stdout.String())
	}
}

// TestCheckAnnouncesAgainWhenTheAddressMoves covers the router handing the machine a new address.
func TestCheckAnnouncesAgainWhenTheAddressMoves(t *testing.T) {
	// Arrange.
	announcing := establishedRig(t)
	announcing.addresses = moved

	// Act.
	announcing.announcer.Check()

	// Assert.
	if announcing.avahi.groups[0].withdrawn == false {
		t.Fatal("left the old address announced")
	}
	assertPublished(t, announcing.avahi, lan, moved)
}

// TestCheckAnnouncesAgainAfterACollision covers another device answering to the name.
func TestCheckAnnouncesAgainAfterACollision(t *testing.T) {
	// Arrange.
	announcing := newRig(lan)
	announcing.announcer.Check()
	announcing.avahi.groups[0].state = Collision

	// Act.
	announcing.announcer.Check()

	// Assert.
	if announcing.avahi.groups[0].withdrawn == false {
		t.Fatal("kept the announcement that collided")
	}
	assertPublished(t, announcing.avahi, lan, lan)
	expected := "Another device on the network already answers to recipes.local. Trying again.\n"
	if announcing.stderr.String() != expected {
		t.Fatalf("wrote %q", announcing.stderr.String())
	}
}

// TestCheckReportsALastingCollisionOnce covers a collision that's still there on the next try.
func TestCheckReportsALastingCollisionOnce(t *testing.T) {
	// Arrange.
	announcing := newRig(lan)
	announcing.announcer.Check()
	announcing.avahi.groups[0].state = Collision
	announcing.announcer.Check()
	announcing.avahi.groups[1].state = Collision

	// Act.
	announcing.announcer.Check()

	// Assert- it keeps trying, and says so once.
	assertPublished(t, announcing.avahi, lan, lan, lan)
	expected := "Another device on the network already answers to recipes.local. Trying again.\n"
	if announcing.stderr.String() != expected {
		t.Fatalf("wrote %q", announcing.stderr.String())
	}
}

// TestCheckAnnouncesAgainWhenAvahiLosesTheName covers Avahi failing an announcement, or restarting and
// forgetting it.
func TestCheckAnnouncesAgainWhenAvahiLosesTheName(t *testing.T) {
	// Arrange.
	announcing := establishedRig(t)
	announcing.avahi.groups[0].state = Lost

	// Act.
	announcing.announcer.Check()

	// Assert.
	if announcing.avahi.groups[0].withdrawn == false {
		t.Fatal("kept the lost announcement")
	}
	assertPublished(t, announcing.avahi, lan, lan)
	if announcing.stderr.String() != "Avahi stopped announcing recipes.local. Announcing it again.\n" {
		t.Fatalf("wrote %q", announcing.stderr.String())
	}
}

// TestCheckReportsTheNameAgainAfterRecovering covers the line that a name is announced coming back after a
// problem, even though it was written once before.
func TestCheckReportsTheNameAgainAfterRecovering(t *testing.T) {
	// Arrange.
	announcing := establishedRig(t)
	announcing.avahi.groups[0].state = Lost
	announcing.announcer.Check()
	announcing.avahi.groups[1].state = Established

	// Act.
	announcing.announcer.Check()

	// Assert.
	if announcing.stdout.String() != "Announcing recipes.local at 192.168.50.19.\n" {
		t.Fatalf("wrote %q", announcing.stdout.String())
	}
}

// TestCheckWithdrawsWhileTheMachineHasNoAddress covers the network going away, and a boot where the site
// starts before the network does.
func TestCheckWithdrawsWhileTheMachineHasNoAddress(t *testing.T) {
	// Arrange.
	announcing := establishedRig(t)
	announcing.addresses = []Address{}

	// Act.
	announcing.announcer.Check()

	// Assert.
	if announcing.avahi.groups[0].withdrawn == false {
		t.Fatal("left the name announced with no address behind it")
	}
	assertPublished(t, announcing.avahi, lan)
	if announcing.stdout.String() != "Waiting for a network address before announcing recipes.local.\n" {
		t.Fatalf("wrote %q", announcing.stdout.String())
	}
}

// TestCheckWithdrawsWhenTheAddressesCantBeListed covers the operating system failing to list the machine's
// network addresses.
func TestCheckWithdrawsWhenTheAddressesCantBeListed(t *testing.T) {
	// Arrange.
	announcing := establishedRig(t)
	announcing.failure = errors.New("no such device")

	// Act.
	announcing.announcer.Check()

	// Assert.
	if announcing.avahi.groups[0].withdrawn == false {
		t.Fatal("left the name announced at addresses nobody could list")
	}
	if announcing.stderr.String() != "Couldn't list this machine's network addresses: no such device\n" {
		t.Fatalf("wrote %q", announcing.stderr.String())
	}
}

// TestCheckReportsAFailedAnnouncementOnce covers Avahi refusing to announce, which is tried again on every
// check and reported only the first time.
func TestCheckReportsAFailedAnnouncementOnce(t *testing.T) {
	// Arrange.
	announcing := newRig(lan)
	announcing.avahi.failure = errors.New("connection refused")

	// Act.
	announcing.announcer.Check()
	announcing.announcer.Check()

	// Assert.
	if slices.Equal(announcing.avahi.names, []string{"recipes.local", "recipes.local"}) == false {
		t.Fatalf("tried %v, expected two tries", announcing.avahi.names)
	}
	if announcing.stderr.String() != "Couldn't announce recipes.local: connection refused\n" {
		t.Fatalf("wrote %q", announcing.stderr.String())
	}
}

// TestRunChecksEveryIntervalUntilCancelled covers the loop: a check right away, one per interval after
// that, and the name withdrawn once it ends.
func TestRunChecksEveryIntervalUntilCancelled(t *testing.T) {
	// Arrange- the third check ends the run.
	announcing := newRig(lan)
	announcing.announcer.interval = time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	checks := 0
	announcing.announcer.addresses = func() ([]Address, error) {
		checks++
		if checks == 3 {
			cancel()
		}
		return lan, nil
	}

	// Act.
	announcing.announcer.Run(ctx)

	// Assert.
	if checks != 3 {
		t.Fatalf("checked %d times, expected 3", checks)
	}
	if announcing.avahi.groups[0].withdrawn == false {
		t.Fatal("left the name announced after the run ended")
	}
}

// TestRunDoesNothingOnceCancelled covers a run that's already over before it starts.
func TestRunDoesNothingOnceCancelled(t *testing.T) {
	// Arrange.
	announcing := newRig(lan)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	// Act.
	announcing.announcer.Run(ctx)

	// Assert.
	if len(announcing.avahi.names) != 0 {
		t.Fatalf("announced %v after the run was over", announcing.avahi.names)
	}
}

// working is how a network looks when it's switched on, plugged in and able to multicast.
const working = net.FlagUp | net.FlagRunning | net.FlagMulticast

// network returns an address the way the operating system lists it on an interface, like 192.168.50.19/24.
func network(t *testing.T, cidr string) net.Addr {
	t.Helper()

	ip, block, err := net.ParseCIDR(cidr)
	if err != nil {
		t.Fatal(err)
	}
	return &net.IPNet{IP: ip, Mask: block.Mask}
}

// ethernet returns the machine's wired network, which every test of reachable keeps.
func ethernet(t *testing.T) candidate {
	t.Helper()

	return candidate{index: 2, flags: working, addresses: []net.Addr{network(t, "192.168.50.19/24")}}
}

// assertReachable fails the test unless reachable picked exactly the wired network's address.
func assertReachable(t *testing.T, found []Address) {
	t.Helper()

	if slices.Equal(found, lan) == false {
		t.Fatalf("got %v, expected %v", found, lan)
	}
}

// TestReachableKeepsTheAddressOnAWorkingNetwork covers the everyday case: one wired network.
func TestReachableKeepsTheAddressOnAWorkingNetwork(t *testing.T) {
	// Arrange.
	candidates := []candidate{ethernet(t)}

	// Act.
	found := reachable(candidates)

	// Assert.
	assertReachable(t, found)
}

// TestReachableSkipsLoopback covers loopback, which only ever reaches the machine itself. It's given
// multicast here so being loopback is the only thing that can rule it out.
func TestReachableSkipsLoopback(t *testing.T) {
	// Arrange.
	loopback := candidate{index: 1, flags: working | net.FlagLoopback, addresses: []net.Addr{network(t, "127.0.0.1/8")}}
	candidates := []candidate{loopback, ethernet(t)}

	// Act.
	found := reachable(candidates)

	// Assert.
	assertReachable(t, found)
}

// TestReachableSkipsANetworkThatIsSwitchedOff covers an interface that isn't up.
func TestReachableSkipsANetworkThatIsSwitchedOff(t *testing.T) {
	// Arrange.
	switchedOff := candidate{index: 3, flags: net.FlagRunning | net.FlagMulticast, addresses: []net.Addr{network(t, "10.0.0.7/24")}}
	candidates := []candidate{switchedOff, ethernet(t)}

	// Act.
	found := reachable(candidates)

	// Assert.
	assertReachable(t, found)
}

// TestReachableSkipsAnUnpluggedNetwork covers an interface that's up with nothing on the other end, like a
// container bridge with no containers.
func TestReachableSkipsAnUnpluggedNetwork(t *testing.T) {
	// Arrange.
	unplugged := candidate{index: 4, flags: net.FlagUp | net.FlagMulticast, addresses: []net.Addr{network(t, "172.17.0.1/16")}}
	candidates := []candidate{unplugged, ethernet(t)}

	// Act.
	found := reachable(candidates)

	// Assert.
	assertReachable(t, found)
}

// TestReachableSkipsALinkWithoutMulticast covers a link like a VPN tunnel, which can't carry the multicast
// Avahi announces with.
func TestReachableSkipsALinkWithoutMulticast(t *testing.T) {
	// Arrange.
	tunnel := candidate{index: 5, flags: net.FlagUp | net.FlagRunning, addresses: []net.Addr{network(t, "10.8.0.2/24")}}
	candidates := []candidate{tunnel, ethernet(t)}

	// Act.
	found := reachable(candidates)

	// Assert.
	assertReachable(t, found)
}

// TestReachableSkipsIPv6Addresses covers the IPv6 addresses a working network also has.
func TestReachableSkipsIPv6Addresses(t *testing.T) {
	// Arrange.
	wired := ethernet(t)
	wired.addresses = append([]net.Addr{network(t, "fde2:8ac3:6bee:9146::19/64")}, wired.addresses...)
	candidates := []candidate{wired}

	// Act.
	found := reachable(candidates)

	// Assert.
	assertReachable(t, found)
}

// TestReachableSkipsASelfAssignedAddress covers the 169.254 address a machine gives itself when nothing
// answered it.
func TestReachableSkipsASelfAssignedAddress(t *testing.T) {
	// Arrange.
	wired := ethernet(t)
	wired.addresses = append([]net.Addr{network(t, "169.254.10.20/16")}, wired.addresses...)
	candidates := []candidate{wired}

	// Act.
	found := reachable(candidates)

	// Assert.
	assertReachable(t, found)
}

// TestReachableSkipsAddressesThatArentNetworks covers an address listed without its network, which some
// systems hand back.
func TestReachableSkipsAddressesThatArentNetworks(t *testing.T) {
	// Arrange.
	wired := ethernet(t)
	wired.addresses = append([]net.Addr{&net.IPAddr{IP: net.ParseIP("192.168.50.30")}}, wired.addresses...)
	candidates := []candidate{wired}

	// Act.
	found := reachable(candidates)

	// Assert.
	assertReachable(t, found)
}
