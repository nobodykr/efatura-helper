import tempfile
import unittest

from market.storage import IntakeError, MarketStore, legal_entity_nif


def valid_nif(prefix="5"):
    first = prefix + "0000000"
    total = sum(int(first[index]) * (9 - index) for index in range(8))
    digit = 11 - total % 11
    return first + str(0 if digit >= 10 else digit)


class MarketStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = MarketStore(self.tmp.name + "/market.db", "p" * 40, k=2)
        self.nif = valid_nif()

    def tearDown(self):
        self.tmp.cleanup()

    def payload(self, token="A" * 43, company_token="B" * 43):
        return {"contract": 1, "agreement": "market-v1", "partition": "efatura",
                "submissionToken": token,
                "shapes": {"efatura.documents.v1": {"rows": [{"field": "number"}, "x2"]}},
                "companies": [{"nif": self.nif, "year": 2026, "token": company_token,
                               "invoiceCount": 2, "grossEur": 20, "vatEur": 3,
                               "sectorCounts": {"C03": 2}}]}

    def test_nif_and_retry_dedupe(self):
        self.assertTrue(legal_entity_nif(self.nif))
        self.store.ingest(self.payload(), now=1000)
        self.store.ingest(self.payload(), now=1001)
        self.assertIsNone(self.store.public_company_year(self.nif, 2026))
        self.store.ingest(self.payload("C" * 43, "D" * 43), now=1002)
        result = self.store.public_company_year(self.nif, 2026)
        self.assertEqual(result["contributors"], 2)
        self.assertEqual(result["gross_eur"], 40)

    def test_rejects_person_and_individual_values(self):
        payload = self.payload()
        payload["companies"][0]["nif"] = "123456789"
        with self.assertRaisesRegex(IntakeError, "bad_company_nif"):
            self.store.ingest(payload)
        payload = self.payload()
        payload["companies"][0]["sectorCounts"] = {"C03": 1}
        with self.assertRaisesRegex(IntakeError, "sector_count_mismatch"):
            self.store.ingest(payload)
        payload = self.payload()
        payload["email"] = "person@example.invalid"
        with self.assertRaisesRegex(IntakeError, "unknown_fields"):
            self.store.ingest(payload)

    def test_requires_known_schema_for_the_matching_source(self):
        payload = self.payload()
        payload["shapes"] = {}
        with self.assertRaisesRegex(IntakeError, "bad_shapes"):
            self.store.ingest(payload)
        payload = self.payload()
        payload["shapes"] = {"invented.endpoint.v1": {"field": "number"}}
        with self.assertRaisesRegex(IntakeError, "bad_endpoint"):
            self.store.ingest(payload)
        payload = self.payload()
        payload["shapes"] = {"rents.contracts.v1": {"field": "number"}}
        with self.assertRaisesRegex(IntakeError, "endpoint_partition_mismatch"):
            self.store.ingest(payload)

    def test_shape_values_are_coerced(self):
        payload = self.payload()
        payload["shapes"] = {"efatura.documents.v1": {
            "unsafe": "a real value",
            "purchaseDate": "2026-08-25",
            "documentId": 123456789,
            "buyer": True,
        }}
        self.store.ingest(payload)
        with self.store._connect() as connection:
            encoded = connection.execute("SELECT shape_json FROM shape_observation").fetchone()[0]
        self.assertEqual(encoded,
                         '{"buyer":"boolean","documentId":"number","purchaseDate":"string","unsafe":"string"}')


if __name__ == "__main__":
    unittest.main()
