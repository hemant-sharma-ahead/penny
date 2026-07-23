import { useState } from 'react';
import { ScrollView, View, Text } from 'react-native';
import {
  AmountInput,
  Badge,
  Banner,
  Button,
  Card,
  ChipAvatar,
  ConfirmDialog,
  DetailRow,
  DismissibleChip,
  EmptyState,
  FormField,
  IconBadge,
  LifeRow,
  ListContainer,
  Modal,
  OptionalSeg,
  OptionButton,
  PageHeader,
  PassphraseStrengthMeter,
  PennyLogo,
  PennyWordmark,
  ProgressBar,
  ProgressRing,
  SearchInput,
  SectionLabel,
  SegmentedControl,
  SelectInput,
  StatBox,
  TabStrip,
  TextInput,
  Toggle
} from '../components/ui';

/**
 * Track 3 verification tool — every ported UI component rendered with representative props, in one
 * scrollable screen. Not a real app screen (no route wires to it yet); its purpose is the plan's
 * "visual checklist per component against the 4 themes" step once a device/simulator is available
 * (docs/plans/mobile-migration.md Track 3) — swap the active theme via ThemeProvider and re-check this
 * screen renders correctly in each. Safe to delete once Track 4's real screens exercise every component
 * anyway, but costs nothing to keep as a living component reference until then.
 */
export function ComponentGalleryScreen() {
  const [toggleOn, setToggleOn] = useState(true);
  const [amount, setAmount] = useState('1200');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<'a' | 'b' | 'c'>('a');
  const [selectVal, setSelectVal] = useState('one');
  const [optSeg, setOptSeg] = useState<string | undefined>(undefined);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <ScrollView className="flex-1 bg-surface-3">
      <PageHeader title="Component gallery" subtitle="Track 3 verification screen" />
      <View className="p-4 gap-6">
        <View className="flex-row items-center gap-4">
          <PennyLogo />
          <PennyWordmark />
          <ChipAvatar />
        </View>

        <View>
          <SectionLabel>Card / DetailRow / ListContainer</SectionLabel>
          <Card>
            <DetailRow label="Label" value="₹1,234" />
          </Card>
          <View className="h-2" />
          <ListContainer>
            <DetailRow label="Row one" value="A" />
            <DetailRow label="Row two" value="B" />
          </ListContainer>
        </View>

        <View>
          <SectionLabel>Badge / IconBadge / DismissibleChip</SectionLabel>
          <View className="flex-row items-center gap-2 flex-wrap">
            <Badge label="Success" />
            <Badge label="Solid" variant="solid" />
            <IconBadge icon="ti-home" color="#00a86b" />
            <DismissibleChip label="Chip" onDismiss={() => {}} />
          </View>
        </View>

        <View>
          <SectionLabel>Banner</SectionLabel>
          <View className="gap-2">
            <Banner variant="info">Info banner text</Banner>
            <Banner variant="warning">Warning banner text</Banner>
            <Banner variant="danger">Danger banner text</Banner>
            <Banner variant="success">Success banner text</Banner>
          </View>
        </View>

        <View>
          <SectionLabel>StatBox / ProgressBar / ProgressRing</SectionLabel>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <StatBox label="Label" value="₹1,234" tone="success" footer="Est. tax: ₹100" />
            </View>
            <View className="items-center justify-center">
              <ProgressRing percentage={62} color="#00a86b" />
            </View>
          </View>
          <View className="h-2" />
          <ProgressBar value={40} />
        </View>

        <View>
          <SectionLabel>EmptyState</SectionLabel>
          <Card>
            <EmptyState
              icon="ti-inbox"
              title="Nothing here"
              description="Add your first item"
              action={{ label: 'Add', onPress: () => {} }}
            />
          </Card>
        </View>

        <View>
          <SectionLabel>Toggle / SegmentedControl / OptionalSeg / OptionButton</SectionLabel>
          <View className="flex-row items-center gap-3">
            <Toggle value={toggleOn} onChange={setToggleOn} />
            <OptionalSeg
              options={[
                { value: 'm', label: 'M' },
                { value: 'f', label: 'F' }
              ]}
              value={optSeg}
              onChange={setOptSeg}
            />
          </View>
          <View className="h-2" />
          <SegmentedControl
            options={[
              { value: 'a', label: 'A' },
              { value: 'b', label: 'B' },
              { value: 'c', label: 'C' }
            ]}
            value={segment}
            onChange={setSegment}
          />
          <View className="h-2" />
          <OptionButton label="Option" description="Details" selected onPress={() => {}} />
        </View>

        <View>
          <SectionLabel>TabStrip</SectionLabel>
          <TabStrip
            options={[
              { value: 'a', label: 'Tab A', count: 3 },
              { value: 'b', label: 'Tab B' }
            ]}
            value={segment}
            onChange={setSegment}
          />
        </View>

        <View>
          <SectionLabel>Form inputs</SectionLabel>
          <View className="gap-3">
            <TextInput label="Text" value={text} onChange={setText} placeholder="Type…" />
            <SearchInput value={search} onChange={setSearch} />
            <SelectInput
              label="Select"
              value={selectVal}
              onChange={setSelectVal}
              options={[
                { value: 'one', label: 'One' },
                { value: 'two', label: 'Two' }
              ]}
            />
            <AmountInput label="Amount" value={amount} onChange={setAmount} />
            <FormField label="With error" error="This field has an error">
              <TextInput value="" onChange={() => {}} />
            </FormField>
            <PassphraseStrengthMeter score={2} />
          </View>
        </View>

        <View>
          <SectionLabel>LifeRow</SectionLabel>
          <ListContainer>
            <LifeRow icon="ti-briefcase" label="Occupation">
              <Text className="text-sm text-secondary">Engineer</Text>
            </LifeRow>
          </ListContainer>
        </View>

        <View>
          <SectionLabel>Modal / ConfirmDialog</SectionLabel>
          <View className="flex-row gap-2">
            <Button onPress={() => setModalOpen(true)}>Open modal</Button>
            <Button variant="danger" onPress={() => setConfirmOpen(true)}>
              Open confirm
            </Button>
          </View>
        </View>

        <View className="h-8" />
      </View>

      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} title="A modal">
          <Text className="text-sm text-secondary">Modal body content.</Text>
        </Modal>
      )}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => setConfirmOpen(false)}
        title="Are you sure?"
        message="This is a confirm dialog."
      />
    </ScrollView>
  );
}
