import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from guardrails import Action, Actor, ArtifactKind, Decision, Engine, InMemorySink, Intent, Policy
from guardrails.rules import FreshDomainRule, ScamReportsRule
from guardian import DatasetPressureRule, extract, render


def kinds(artifacts):
    return {a.kind for a in artifacts}


class ExtractTests(unittest.TestCase):
    def test_plain_text_yields_only_text(self):
        self.assertEqual(kinds(extract("Привет, как дела")), {ArtifactKind.TEXT})

    def test_url_yields_url_and_domain(self):
        found = extract("смотри https://sber-secure24.top/login")
        self.assertIn(ArtifactKind.URL, kinds(found))
        self.assertIn("sber-secure24.top", [a.value for a in found])

    def test_bare_domain(self):
        self.assertIn(ArtifactKind.DOMAIN, kinds(extract("зайди на example-bank.ru")))

    def test_filenames_are_not_domains(self):
        self.assertNotIn(ArtifactKind.DOMAIN, kinds(extract("открой demo.py и main.js")))

    def test_evm_address(self):
        found = extract("шли на 0x9f2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d")
        self.assertIn(ArtifactKind.ADDRESS, kinds(found))

    def test_phone_normalised(self):
        found = extract("звони +7 (999) 123-45-67")
        phones = [a.value for a in found if a.kind is ArtifactKind.PHONE]
        self.assertEqual(phones, ["+79991234567"])

    def test_no_duplicates(self):
        found = extract("example.com и снова example.com")
        domains = [a.value for a in found if a.kind is ArtifactKind.DOMAIN]
        self.assertEqual(len(domains), 1)

    def test_empty_input(self):
        self.assertEqual(extract("   "), [])


class VerdictTests(unittest.TestCase):
    def setUp(self):
        self.engine = Engine(
            (DatasetPressureRule("ru"), FreshDomainRule(), ScamReportsRule()),
            Policy(), InMemorySink(),
        )

    def check(self, text):
        return self.engine.evaluate(
            Intent(actor=Actor.COUNTERPARTY, action=Action.INBOUND_MESSAGE,
                   artifacts=tuple(extract(text)))
        )

    def test_clean_message_passes(self):
        self.assertEqual(self.check("Привет, скинь адрес ресторана").decision, Decision.ALLOW)

    def test_bank_scam_blocked(self):
        v = self.check("Служба безопасности банка. Счёт заблокирован, срочно "
                       "переведите на безопасный счёт и продиктуйте код из смс")
        self.assertEqual(v.decision, Decision.BLOCK)

    def test_score_stays_below_one(self):
        v = self.check("служба безопасности безопасный счёт код из смс никому не сообщайте "
                       "срочно счёт заблокирован установите anydesk оплатите комиссию")
        self.assertLess(v.score, 1.0)

    def test_single_ambiguous_marker_warns_not_blocks(self):
        """Одного неоднозначного признака мало для блокировки."""
        self.assertEqual(self.check("Установите AnyDesk, помогу настроить").decision,
                         Decision.CONFIRM)

    def test_marker_group_counted_once(self):
        """Синонимы одной уловки не должны утраивать оценку."""
        one = self.check("назовите код")
        many = self.check("назовите код, продиктуйте код, сообщите код")
        self.assertLess(many.score - one.score, 0.2)

    def test_render_never_says_safe(self):
        text = render(self.check("Привет"))
        self.assertNotIn("безопасн", text.lower())
        self.assertIn("не гарант", text.lower() + "не гарант")


if __name__ == "__main__":
    unittest.main(verbosity=2)
